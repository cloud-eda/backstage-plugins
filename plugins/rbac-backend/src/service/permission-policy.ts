import { Config } from '@backstage/config';
import { ConfigApi } from '@backstage/core-plugin-api';
import {
  BackstageIdentityResponse,
  BackstageUserIdentity,
} from '@backstage/plugin-auth-node';
import {
  AuthorizeResult,
  isResourcePermission,
  PolicyDecision,
} from '@backstage/plugin-permission-common';
import {
  PermissionPolicy,
  PolicyQuery,
} from '@backstage/plugin-permission-node';

import { Enforcer, FileAdapter, newEnforcer, newModelFromString } from 'casbin';
import { Knex } from 'knex';
import { Logger } from 'winston';

import { ConditionalStorage } from '../database/conditional-storage';
import { RoleMetadataStorage } from '../database/role-metadata';
import { metadataStringToPolicy, removeTheDifference } from '../helper';
import { EnforcerDelegate } from './enforcer-delegate';
import { MODEL } from './permission-model';
import {
  validateAllPredefinedPolicies,
  validateEntityReference,
} from './policies-validation';

const adminRoleName = 'role:default/rbac_admin';

const useAdmins = async (
  admins: Config[],
  enf: EnforcerDelegate,
  roleMetadataStorage: RoleMetadataStorage,
  knex: Knex,
) => {
  let legacy = false;
  const rbacAdminsGroupPolicies: string[][] = [];
  const groupPoliciesToCompare: string[] = [];
  const addedGroupPolicies: string[] = [];

  admins.forEach(async localConfig => {
    const entityRef = localConfig.getString('name');
    validateEntityReference(entityRef);

    const groupPolicy = [entityRef, adminRoleName];
    if (!(await enf.hasGroupingPolicy(...groupPolicy))) {
      rbacAdminsGroupPolicies.push(groupPolicy);
      addedGroupPolicies.push(entityRef);
    }
  });

  const adminRoleMeta =
    await roleMetadataStorage.findRoleMetadata(adminRoleName);

  if (adminRoleMeta?.source === 'legacy') {
    const trx = await knex.transaction();
    try {
      await roleMetadataStorage.removeRoleMetadata(adminRoleName, trx);
      await trx.commit();
      legacy = true;
    } catch (error) {
      await trx.rollback(error);
    }
  }

  if (!adminRoleMeta || legacy) {
    const trx = await knex.transaction();
    try {
      await roleMetadataStorage.createRoleMetadata(
        { source: 'configuration' },
        adminRoleName,
        trx,
      );
      await trx.commit();
    } catch (error) {
      await trx.rollback(error);
    }
  }

  await enf.addOrUpdateGroupingPolicies(
    rbacAdminsGroupPolicies,
    'configuration',
    false,
  );

  const configPoliciesMetadata =
    await enf.getFilteredPolicyMetadata('configuration');

  for (const policyMetadata of configPoliciesMetadata) {
    if (metadataStringToPolicy(policyMetadata.policy).length === 2) {
      const stringPolicy = metadataStringToPolicy(policyMetadata.policy);
      groupPoliciesToCompare.push(stringPolicy.at(0)!);
    }
  }

  await removeTheDifference(
    groupPoliciesToCompare,
    addedGroupPolicies,
    'configuration',
    adminRoleName,
    enf,
  );

  const adminReadPermission = [adminRoleName, 'policy-entity', 'read', 'allow'];
  await enf.addOrUpdatePolicy(adminReadPermission, 'configuration', false);

  const adminCreatePermission = [
    adminRoleName,
    'policy-entity',
    'create',
    'allow',
  ];
  await enf.addOrUpdatePolicy(adminCreatePermission, 'configuration', false);

  const adminDeletePermission = [
    adminRoleName,
    'policy-entity',
    'delete',
    'allow',
  ];
  await enf.addOrUpdatePolicy(adminDeletePermission, 'configuration', false);

  const adminUpdatePermission = [
    adminRoleName,
    'policy-entity',
    'update',
    'allow',
  ];
  await enf.addOrUpdatePolicy(adminUpdatePermission, 'configuration', false);
};

const removedOldPermissionPoliciesFileData = async (
  enf: EnforcerDelegate,
  fileEnf?: Enforcer,
) => {
  const tempEnforcer =
    fileEnf || (await newEnforcer(newModelFromString(MODEL)));
  const oldFilePolicies = new Set<string[]>();
  const policiesMetadata = await enf.getFilteredPolicyMetadata('csv-file');
  for (const policyMetadata of policiesMetadata) {
    oldFilePolicies.add(metadataStringToPolicy(policyMetadata.policy));
  }

  const policiesToDelete: string[][] = [];
  const groupPoliciesToDelete: string[][] = [];
  for (const oldFilePolicy of oldFilePolicies) {
    if (
      oldFilePolicy.length === 2 &&
      !(await tempEnforcer.hasGroupingPolicy(...oldFilePolicy))
    ) {
      groupPoliciesToDelete.push(oldFilePolicy);
    } else if (
      oldFilePolicy.length > 2 &&
      !(await tempEnforcer.hasPolicy(...oldFilePolicy))
    ) {
      policiesToDelete.push(oldFilePolicy);
    }
  }

  if (groupPoliciesToDelete.length > 0) {
    await enf.removeGroupingPolicies(groupPoliciesToDelete, 'csv-file', true);
  }
  if (policiesToDelete.length > 0) {
    await enf.removePolicies(policiesToDelete, 'csv-file', true);
  }
};

const addPermissionPoliciesFileData = async (
  preDefinedPoliciesFile: string,
  enf: EnforcerDelegate,
  roleMetadataStorage: RoleMetadataStorage,
) => {
  const fileEnf = await newEnforcer(
    newModelFromString(MODEL),
    new FileAdapter(preDefinedPoliciesFile),
  );
  const policies = await fileEnf.getPolicy();
  const groupPolicies = await fileEnf.getGroupingPolicy();

  await validateAllPredefinedPolicies(
    Array.from(policies),
    Array.from(groupPolicies),
    preDefinedPoliciesFile,
    roleMetadataStorage,
  );

  await removedOldPermissionPoliciesFileData(enf, fileEnf);

  for (const policy of policies) {
    await enf.addOrUpdatePolicy(policy, 'csv-file', true);
  }

  for (const groupPolicy of groupPolicies) {
    await enf.addOrUpdateGroupingPolicy(groupPolicy, 'csv-file', false);
  }
};

export class RBACPermissionPolicy implements PermissionPolicy {
  private readonly enforcer: EnforcerDelegate;
  private readonly logger: Logger;
  private readonly conditionStorage: ConditionalStorage;

  public static async build(
    logger: Logger,
    configApi: ConfigApi,
    conditionalStorage: ConditionalStorage,
    enforcerDelegate: EnforcerDelegate,
    roleMetadataStorage: RoleMetadataStorage,
    knex: Knex,
  ): Promise<RBACPermissionPolicy> {
    const adminUsers = configApi.getOptionalConfigArray(
      'permission.rbac.admin.users',
    );

    const policiesFile = configApi.getOptionalString(
      'permission.rbac.policies-csv-file',
    );

    if (policiesFile) {
      await addPermissionPoliciesFileData(
        policiesFile,
        enforcerDelegate,
        roleMetadataStorage,
      );
    } else {
      await removedOldPermissionPoliciesFileData(enforcerDelegate);
    }

    if (adminUsers) {
      await useAdmins(adminUsers, enforcerDelegate, roleMetadataStorage, knex);
    }

    return new RBACPermissionPolicy(
      enforcerDelegate,
      logger,
      conditionalStorage,
    );
  }

  private constructor(
    enforcer: EnforcerDelegate,
    logger: Logger,
    conditionStorage: ConditionalStorage,
  ) {
    this.enforcer = enforcer;
    this.logger = logger;
    this.conditionStorage = conditionStorage;
  }

  async handle(
    request: PolicyQuery,
    identityResp?: BackstageIdentityResponse | undefined,
  ): Promise<PolicyDecision> {
    this.logger.info(
      `Policy check for ${identityResp?.identity.userEntityRef} for permission ${request.permission.name}`,
    );
    try {
      let status = false;

      // We are introducing an action named "use" when action does not exist to avoid
      // a more complicated model with multiple policy and request shapes.
      const action = request.permission.attributes.action ?? 'use';

      if (isResourcePermission(request.permission)) {
        status = await this.isAuthorized(
          identityResp?.identity,
          request.permission.resourceType,
          action,
        );

        if (status && identityResp) {
          const conditionalDecision = await this.conditionStorage.findCondition(
            request.permission.resourceType,
          );
          if (conditionalDecision) {
            return conditionalDecision;
          }
        }
      } else {
        status = await this.isAuthorized(
          identityResp?.identity,
          request.permission.name,
          action,
        );
      }

      const result = status ? AuthorizeResult.ALLOW : AuthorizeResult.DENY;
      this.logger.info(
        `${identityResp?.identity.userEntityRef} is ${result} for permission ${request.permission.name} and action ${action}`,
      );
      return Promise.resolve({
        result: result,
      });
    } catch (error) {
      this.logger.error(`Policy check failed with ${error}`);
      return Promise.resolve({
        result: AuthorizeResult.DENY,
      });
    }
  }

  private isAuthorized = async (
    identity: BackstageUserIdentity | undefined,
    resourceType: string,
    action: string,
  ): Promise<boolean> => {
    if (!identity) {
      return false;
    }

    const entityRef = identity.userEntityRef;

    return await this.enforcer.enforce(entityRef, resourceType, action);
  };
}
