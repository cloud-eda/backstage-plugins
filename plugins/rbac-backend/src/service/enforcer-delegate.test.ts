import { getVoidLogger } from '@backstage/backend-common';
import { mockServices } from '@backstage/backend-test-utils';
import { ConfigReader } from '@backstage/config';

import { newEnforcer, newModelFromString } from 'casbin';
import * as Knex from 'knex';
import { MockClient } from 'knex-mock-client';

import { Source } from '@janus-idp/backstage-plugin-rbac-common';

import { CasbinDBAdapterFactory } from '../database/casbin-adapter-factory';
import {
  RoleMetadataDao,
  RoleMetadataStorage,
} from '../database/role-metadata';
import { BackstageRoleManager } from '../role-manager/role-manager';
import { EnforcerDelegate } from './enforcer-delegate';
import { MODEL } from './permission-model';

const catalogApi = {
  getEntityAncestors: jest.fn().mockImplementation(),
  getLocationById: jest.fn().mockImplementation(),
  getEntities: jest.fn().mockImplementation(),
  getEntitiesByRefs: jest.fn().mockImplementation(),
  queryEntities: jest.fn().mockImplementation(),
  getEntityByRef: jest.fn().mockImplementation(),
  refreshEntity: jest.fn().mockImplementation(),
  getEntityFacets: jest.fn().mockImplementation(),
  addLocation: jest.fn().mockImplementation(),
  getLocationByRef: jest.fn().mockImplementation(),
  removeLocationById: jest.fn().mockImplementation(),
  removeEntityByUid: jest.fn().mockImplementation(),
  validateEntity: jest.fn().mockImplementation(),
  getLocationByEntity: jest.fn().mockImplementation(),
};

const roleMetadataStorageMock: RoleMetadataStorage = {
  findRoleMetadata: jest.fn().mockImplementation(),
  createRoleMetadata: jest.fn().mockImplementation(),
  updateRoleMetadata: jest.fn().mockImplementation(),
  removeRoleMetadata: jest.fn().mockImplementation(),
};

const dbManagerMock = Knex.knex({ client: MockClient });

const mockAuthService = mockServices.auth();

const config = new ConfigReader({
  backend: {
    database: {
      client: 'better-sqlite3',
      connection: ':memory:',
    },
  },
  permission: {
    rbac: {},
  },
});
const policy = ['user:default/tom', 'policy-entity', 'read', 'allow'];
const secondPolicy = ['user:default/tim', 'catalog-entity', 'write', 'allow'];

const groupingPolicy = ['user:default/tom', 'role:default/dev-team'];
const secondGroupingPolicy = ['user:default/tim', 'role:default/qa-team'];

describe('EnforcerDelegate', () => {
  let enfRemovePolicySpy: jest.SpyInstance<Promise<boolean>, string[], any>;
  let enfRemovePoliciesSpy: jest.SpyInstance<
    Promise<boolean>,
    [rules: string[][]],
    any
  >;
  let enfRemoveGroupingPolicySpy: jest.SpyInstance<
    Promise<boolean>,
    string[],
    any
  >;
  let enfFilterGroupingPolicySpy: jest.SpyInstance<
    Promise<string[][]>,
    [fieldIndex: number, ...fieldValues: string[]],
    any
  >;
  let enfRemoveGroupingPoliciesSpy: jest.SpyInstance<
    Promise<boolean>,
    [rules: string[][]],
    any
  >;
  let enfAddPolicySpy: jest.SpyInstance<
    Promise<boolean>,
    [...policy: string[]],
    any
  >;
  let enfAddGroupingPolicySpy: jest.SpyInstance<
    Promise<boolean>,
    [...policy: string[]],
    any
  >;
  let enfAddGroupingPoliciesSpy: jest.SpyInstance<
    Promise<boolean>,
    [policy: string[][]],
    any
  >;
  let enfAddPoliciesSpy: jest.SpyInstance<
    Promise<boolean>,
    [rules: string[][]],
    any
  >;

  const modifiedBy = 'user:default/some-admin';

  beforeEach(() => {
    (roleMetadataStorageMock.createRoleMetadata as jest.Mock).mockReset();
    (roleMetadataStorageMock.updateRoleMetadata as jest.Mock).mockReset();
    (roleMetadataStorageMock.findRoleMetadata as jest.Mock).mockReset();
    (roleMetadataStorageMock.removeRoleMetadata as jest.Mock).mockReset();
  });

  const knex = Knex.knex({ client: MockClient });

  async function createEnfDelegate(
    policies?: string[][],
    groupingPolicies?: string[][],
    source?: Source,
  ): Promise<EnforcerDelegate> {
    const theModel = newModelFromString(MODEL);
    const logger = getVoidLogger();

    const sqliteInMemoryAdapter = await new CasbinDBAdapterFactory(
      config,
      dbManagerMock,
    ).createAdapter();

    const catalogDBClient = Knex.knex({ client: MockClient });
    const rbacDBClient = Knex.knex({ client: MockClient });
    const enf = await newEnforcer(theModel, sqliteInMemoryAdapter);
    enfRemovePolicySpy = jest.spyOn(enf, 'removePolicy');
    enfRemovePoliciesSpy = jest.spyOn(enf, 'removePolicies');
    enfRemoveGroupingPolicySpy = jest.spyOn(enf, 'removeGroupingPolicy');
    enfFilterGroupingPolicySpy = jest.spyOn(enf, 'getFilteredGroupingPolicy');
    enfRemoveGroupingPoliciesSpy = jest.spyOn(enf, 'removeGroupingPolicies');
    enfAddPolicySpy = jest.spyOn(enf, 'addPolicy');
    enfAddGroupingPolicySpy = jest.spyOn(enf, 'addGroupingPolicy');
    enfAddGroupingPoliciesSpy = jest.spyOn(enf, 'addGroupingPolicies');
    enfAddPoliciesSpy = jest.spyOn(enf, 'addPolicies');

    const rm = new BackstageRoleManager(
      catalogApi,
      logger,
      catalogDBClient,
      rbacDBClient,
      config,
      mockAuthService,
    );
    enf.setRoleManager(rm);
    enf.enableAutoBuildRoleLinks(false);
    await enf.buildRoleLinks();

    if (policies && policies.length > 0) {
      await enf.addPolicies(policies.map(p => [...p, source ?? 'rest']));
    }
    if (groupingPolicies && groupingPolicies.length > 0) {
      await enf.addGroupingPolicies(
        groupingPolicies.map(p => [...p, source ?? 'rest']),
      );
    }

    return new EnforcerDelegate(enf, roleMetadataStorageMock, knex);
  }

  describe('hasPolicy', () => {
    it('has policy should return false', async () => {
      const enfDelegate = await createEnfDelegate();
      const result = await enfDelegate.hasPolicy(...policy, 'rest');

      expect(result).toBeFalsy();
    });

    it('has policy should return true', async () => {
      const enfDelegate = await createEnfDelegate([policy]);

      const result = await enfDelegate.hasPolicy(...policy, 'rest');

      expect(result).toBeTruthy();
    });
  });

  describe('hasGroupingPolicy', () => {
    it('has policy should return false', async () => {
      const enfDelegate = await createEnfDelegate([policy]);
      const result = await enfDelegate.hasGroupingPolicy(
        ...groupingPolicy,
        'rest',
      );

      expect(result).toBeFalsy();
    });

    it('has policy should return true', async () => {
      const enfDelegate = await createEnfDelegate([], [groupingPolicy]);

      const result = await enfDelegate.hasGroupingPolicy(
        ...groupingPolicy,
        'rest',
      );

      expect(result).toBeTruthy();
    });
  });

  describe('getPolicy', () => {
    it('should return empty array', async () => {
      const enfDelegate = await createEnfDelegate();
      const policies = await enfDelegate.getPolicy();

      expect(policies.length).toEqual(0);
    });

    it('should return policy', async () => {
      const enfDelegate = await createEnfDelegate([policy]);

      const policies = await enfDelegate.getPolicy();

      expect(policies.length).toEqual(1);
      expect(policies[0]).toEqual([...policy, 'rest']);
    });
  });

  describe('getGroupingPolicy', () => {
    it('should return empty array', async () => {
      const enfDelegate = await createEnfDelegate();
      const groupingPolicies = await enfDelegate.getGroupingPolicy();

      expect(groupingPolicies.length).toEqual(0);
    });

    it('should return grouping policy', async () => {
      const enfDelegate = await createEnfDelegate([], [groupingPolicy]);

      const policies = await enfDelegate.getGroupingPolicy();

      expect(policies.length).toEqual(1);
      expect(policies[0]).toEqual([...groupingPolicy, 'rest']);
    });
  });

  describe('getFilteredPolicy', () => {
    it('should return empty array', async () => {
      const enfDelegate = await createEnfDelegate();
      // filter by policy assignment person
      const policies = await enfDelegate.getFilteredPolicy(0, policy[0]);

      expect(policies.length).toEqual(0);
    });

    it('should return filteredPolicy', async () => {
      const enfDelegate = await createEnfDelegate([policy, secondPolicy]);

      // filter by policy assignment person
      const policies = await enfDelegate.getFilteredPolicy(
        0,
        'user:default/tim',
      );

      expect(policies.length).toEqual(1);
      expect(policies[0]).toEqual([...secondPolicy, 'rest']);
    });
  });

  describe('getFilteredGroupingPolicy', () => {
    it('should return empty array', async () => {
      const enfDelegate = await createEnfDelegate();
      // filter by policy assignment person
      const policies = await enfDelegate.getFilteredGroupingPolicy(
        0,
        'user:default/tim',
      );

      expect(policies.length).toEqual(0);
    });

    it('should return filteredPolicy', async () => {
      const enfDelegate = await createEnfDelegate(
        [],
        [groupingPolicy, secondGroupingPolicy],
      );

      // filter by policy assignment person
      const policies = await enfDelegate.getFilteredGroupingPolicy(
        0,
        'user:default/tim',
      );

      expect(policies.length).toEqual(1);
      expect(policies[0]).toEqual([...secondGroupingPolicy, 'rest']);
    });
  });

  describe('addPolicy', () => {
    it('should add policy', async () => {
      const enfDelegate = await createEnfDelegate();
      enfAddPolicySpy.mockClear();

      await enfDelegate.addPolicy(policy, 'rest');

      expect(enfAddPolicySpy).toHaveBeenCalledWith(...policy, 'rest');

      expect(await enfDelegate.getPolicy()).toEqual([[...policy, 'rest']]);
    });
  });

  describe('addPolicies', () => {
    it('should be added single policy', async () => {
      const enfDelegate = await createEnfDelegate();

      await enfDelegate.addPolicies([policy], 'rest');

      const storePolicies = await enfDelegate.getPolicy();

      expect(storePolicies).toEqual([[...policy, 'rest']]);
      expect(enfAddPoliciesSpy).toHaveBeenCalledWith([[...policy, 'rest']]);
    });

    it('should be added few policies', async () => {
      const enfDelegate = await createEnfDelegate();

      await enfDelegate.addPolicies([policy, secondPolicy], 'rest');

      const storePolicies = await enfDelegate.getPolicy();

      expect(storePolicies.length).toEqual(2);
      expect(storePolicies).toEqual(
        expect.arrayContaining([
          expect.objectContaining([...policy, 'rest']),
          expect.objectContaining([...secondPolicy, 'rest']),
        ]),
      );
      expect(enfAddPoliciesSpy).toHaveBeenCalledWith([
        [...policy, 'rest'],
        [...secondPolicy, 'rest'],
      ]);
    });

    it('should not fail, when argument is empty array', async () => {
      const enfDelegate = await createEnfDelegate();

      enfDelegate.addPolicies([], 'rest');

      expect(enfAddPoliciesSpy).not.toHaveBeenCalled();
      expect((await enfDelegate.getPolicy()).length).toEqual(0);
    });
  });

  describe('addGroupingPolicy', () => {
    it('should add grouping policy and create role metadata', async () => {
      (roleMetadataStorageMock.findRoleMetadata as jest.Mock).mockReturnValue(
        Promise.resolve(undefined),
      );

      const enfDelegate = await createEnfDelegate();

      const roleEntityRef = 'role:default/dev-team';
      await enfDelegate.addGroupingPolicy(groupingPolicy, {
        source: 'rest',
        roleEntityRef: roleEntityRef,
        author: modifiedBy,
        modifiedBy,
      });

      expect(enfAddGroupingPolicySpy).toHaveBeenCalledWith(
        ...groupingPolicy,
        'rest',
      );
      expect(roleMetadataStorageMock.createRoleMetadata).toHaveBeenCalled();
      expect(
        (roleMetadataStorageMock.createRoleMetadata as jest.Mock).mock.calls
          .length,
      ).toEqual(1);
      const metadata: RoleMetadataDao = (
        roleMetadataStorageMock.createRoleMetadata as jest.Mock
      ).mock.calls[0][0];
      const createdAtData = new Date(`${metadata.createdAt}`);
      const lastModified = new Date(`${metadata.lastModified}`);
      expect(lastModified).toEqual(createdAtData);

      expect(metadata.source).toEqual('rest');
      expect(metadata.roleEntityRef).toEqual('role:default/dev-team');
    });

    it('should fail to add policy, caused role metadata storage error', async () => {
      const enfDelegate = await createEnfDelegate();

      roleMetadataStorageMock.createRoleMetadata = jest
        .fn()
        .mockImplementation(() => {
          throw new Error('some unexpected error');
        });

      await expect(
        enfDelegate.addGroupingPolicy(groupingPolicy, {
          source: 'rest',
          roleEntityRef: 'role:default/dev-team',
          author: modifiedBy,
          modifiedBy,
        }),
      ).rejects.toThrow('some unexpected error');
    });

    it('should update role metadata on addGroupingPolicy, because metadata has been created', async () => {
      roleMetadataStorageMock.findRoleMetadata = jest
        .fn()
        .mockImplementation(
          async (
            _roleEntityRef: string,
            _trx: Knex.Knex.Transaction,
          ): Promise<RoleMetadataDao> => {
            return {
              source: 'csv-file',
              roleEntityRef: 'role:default/dev-team',
              createdAt: '2024-03-01 00:23:41+00',
              author: modifiedBy,
              modifiedBy,
            };
          },
        );

      const enfDelegate = await createEnfDelegate();

      const roleEntityRef = 'role:default/dev-team';
      await enfDelegate.addGroupingPolicy(groupingPolicy, {
        source: 'rest',
        roleEntityRef,
        author: modifiedBy,
        modifiedBy,
      });

      expect(enfAddGroupingPolicySpy).toHaveBeenCalledWith(
        ...groupingPolicy,
        'rest',
      );

      expect(roleMetadataStorageMock.createRoleMetadata).not.toHaveBeenCalled();
      const metadata: RoleMetadataDao = (
        roleMetadataStorageMock.updateRoleMetadata as jest.Mock
      ).mock.calls[0][0];
      const createdAtData = new Date(`${metadata.createdAt}`);
      const lastModified = new Date(`${metadata.lastModified}`);
      expect(lastModified > createdAtData).toBeTruthy();

      expect(metadata.source).toEqual('rest');
      expect(metadata.roleEntityRef).toEqual('role:default/dev-team');
    });
  });

  describe('addGroupingPolicies', () => {
    it('should add grouping policies and create role metadata', async () => {
      const enfDelegate = await createEnfDelegate();

      const roleMetadataDao: RoleMetadataDao = {
        roleEntityRef: 'role:default/security',
        source: 'rest',
        author: modifiedBy,
        modifiedBy,
      };
      await enfDelegate.addGroupingPolicies(
        [groupingPolicy, secondGroupingPolicy],
        roleMetadataDao,
      );

      const storedPolicies = await enfDelegate.getGroupingPolicy();
      expect(storedPolicies).toEqual([
        [...groupingPolicy, 'rest'],
        [...secondGroupingPolicy, 'rest'],
      ]);

      expect(enfAddGroupingPoliciesSpy).toHaveBeenCalledWith([
        [...groupingPolicy, 'rest'],
        [...secondGroupingPolicy, 'rest'],
      ]);

      expect(roleMetadataStorageMock.createRoleMetadata).toHaveBeenCalledWith(
        roleMetadataDao,
        expect.anything(),
      );

      const metadata: RoleMetadataDao = (
        roleMetadataStorageMock.createRoleMetadata as jest.Mock
      ).mock.calls[0][0];

      const createdAtData = new Date(`${metadata.createdAt}`);
      const lastModified = new Date(`${metadata.lastModified}`);
      expect(lastModified).toEqual(createdAtData);
      expect(metadata.author).toEqual(modifiedBy);
      expect(metadata.roleEntityRef).toEqual('role:default/security');
      expect(metadata.source).toEqual('rest');
      expect(metadata.description).toBeUndefined();
    });

    it('should add grouping policies and create role metadata with description', async () => {
      const enfDelegate = await createEnfDelegate();

      const description = 'Role for security engineers';
      const roleMetadataDao: RoleMetadataDao = {
        roleEntityRef: 'role:default/security',
        source: 'rest',
        description,
        author: modifiedBy,
        modifiedBy,
      };
      await enfDelegate.addGroupingPolicies(
        [groupingPolicy, secondGroupingPolicy],
        roleMetadataDao,
      );

      const storedPolicies = await enfDelegate.getGroupingPolicy();
      expect(storedPolicies).toEqual([
        [...groupingPolicy, 'rest'],
        [...secondGroupingPolicy, 'rest'],
      ]);

      expect(enfAddGroupingPoliciesSpy).toHaveBeenCalledWith([
        [...groupingPolicy, 'rest'],
        [...secondGroupingPolicy, 'rest'],
      ]);

      expect(roleMetadataStorageMock.createRoleMetadata).toHaveBeenCalledWith(
        roleMetadataDao,
        expect.anything(),
      );

      const metadata: RoleMetadataDao = (
        roleMetadataStorageMock.createRoleMetadata as jest.Mock
      ).mock.calls[0][0];

      const createdAtData = new Date(`${metadata.createdAt}`);
      const lastModified = new Date(`${metadata.lastModified}`);
      expect(lastModified).toEqual(createdAtData);
      expect(metadata.roleEntityRef).toEqual('role:default/security');
      expect(metadata.source).toEqual('rest');
      expect(metadata.description).toEqual('Role for security engineers');
    });

    it('should fail to add grouping policy, because fail to create role metadata', async () => {
      roleMetadataStorageMock.createRoleMetadata = jest
        .fn()
        .mockImplementation(() => {
          throw new Error('some unexpected error');
        });

      const enfDelegate = await createEnfDelegate();

      const roleMetadataDao: RoleMetadataDao = {
        roleEntityRef: 'role:default/security',
        source: 'rest',
        author: 'user:default/some-user',
        modifiedBy: 'user:default/some-user',
      };
      await expect(
        enfDelegate.addGroupingPolicies(
          [groupingPolicy, secondGroupingPolicy],
          roleMetadataDao,
        ),
      ).rejects.toThrow('some unexpected error');

      // shouldn't store group policies
      const storedPolicies = await enfDelegate.getGroupingPolicy();
      expect(storedPolicies).toEqual([]);
    });

    it('should update role metadata, because metadata has been created', async () => {
      (roleMetadataStorageMock.findRoleMetadata as jest.Mock) = jest
        .fn()
        .mockReturnValueOnce({
          source: 'csv-file',
          roleEntityRef: 'role:default/dev-team',
          author: 'user:default/some-user',
          description: 'Role for dev engineers',
          createdAt: '2024-03-01 00:23:41+00',
        });

      const enfDelegate = await createEnfDelegate();

      const roleMetadataDao: RoleMetadataDao = {
        roleEntityRef: 'role:default/dev-team',
        source: 'rest',
        author: 'user:default/some-user',
        modifiedBy,
      };
      await enfDelegate.addGroupingPolicies(
        [
          ['user:default/tom', 'role:default/dev-team'],
          ['user:default/tim', 'role:default/dev-team'],
        ],
        roleMetadataDao,
      );
      const storedPolicies = await enfDelegate.getGroupingPolicy();

      expect(storedPolicies).toEqual([
        ['user:default/tom', 'role:default/dev-team', 'rest'],
        ['user:default/tim', 'role:default/dev-team', 'rest'],
      ]);

      expect(enfAddGroupingPoliciesSpy).toHaveBeenCalledWith([
        ['user:default/tom', 'role:default/dev-team', 'rest'],
        ['user:default/tim', 'role:default/dev-team', 'rest'],
      ]);

      expect(roleMetadataStorageMock.createRoleMetadata).not.toHaveBeenCalled();

      const metadata = (roleMetadataStorageMock.updateRoleMetadata as jest.Mock)
        .mock.calls[0][0];

      const createdAtData = new Date(`${metadata.createdAt}`);
      const lastModified = new Date(`${metadata.lastModified}`);
      expect(lastModified > createdAtData).toBeTruthy();
      expect(metadata.author).toEqual('user:default/some-user');
      expect(metadata.description).toEqual('Role for dev engineers');
      expect(metadata.modifiedBy).toEqual(modifiedBy);
      expect(metadata.roleEntityRef).toEqual('role:default/dev-team');
      expect(metadata.source).toEqual('rest');
    });
  });

  describe('updateGroupingPolicies', () => {
    it('should update grouping policies: add one more policy and update roleMetadata with new modifiedBy', async () => {
      roleMetadataStorageMock.findRoleMetadata = jest
        .fn()
        .mockImplementation(async (): Promise<RoleMetadataDao> => {
          return {
            source: 'rest',
            roleEntityRef: 'role:default/dev-team',
            author: 'user:default/tom',
            modifiedBy: 'user:default/tom',
            description: 'Role for dev engineers',
            createdAt: '2024-03-01 00:23:41+00',
          };
        });

      const enfDelegate = await createEnfDelegate([], [groupingPolicy]);

      const roleMetadataDao: RoleMetadataDao = {
        roleEntityRef: 'role:default/dev-team',
        source: 'rest',
        author: modifiedBy,
        modifiedBy: 'user:default/system-admin',
      };

      await enfDelegate.updateGroupingPolicies(
        [groupingPolicy],
        [groupingPolicy, secondGroupingPolicy],
        roleMetadataDao,
      );

      const storedPolicies = await enfDelegate.getGroupingPolicy();
      expect(storedPolicies.length).toEqual(2);

      expect(enfRemoveGroupingPoliciesSpy).toHaveBeenCalledWith([
        [...groupingPolicy, 'rest'],
      ]);
      expect(enfAddGroupingPoliciesSpy).toHaveBeenCalledWith([
        [...groupingPolicy, 'rest'],
        [...secondGroupingPolicy, 'rest'],
      ]);

      const metadata = (roleMetadataStorageMock.updateRoleMetadata as jest.Mock)
        .mock.calls[0][0];

      const createdAtData = new Date(`${metadata.createdAt}`);
      const lastModified = new Date(`${metadata.lastModified}`);
      expect(lastModified > createdAtData).toBeTruthy();
      expect(metadata.author).toEqual('user:default/tom');
      expect(metadata.description).toEqual('Role for dev engineers');
      expect(metadata.modifiedBy).toEqual('user:default/system-admin');
      expect(metadata.roleEntityRef).toEqual('role:default/dev-team');
      expect(metadata.source).toEqual('rest');
    });

    it('should update grouping policies: one policy should be removed for updateGroupingPolicies', async () => {
      roleMetadataStorageMock.findRoleMetadata = jest
        .fn()
        .mockImplementation(async (): Promise<RoleMetadataDao> => {
          return {
            source: 'rest',
            roleEntityRef: 'role:default/dev-team',
            author: modifiedBy,
            modifiedBy,
            description: 'Role for dev engineers',
            createdAt: '2024-03-01 00:23:41+00',
          };
        });

      const enfDelegate = await createEnfDelegate(
        [],
        [groupingPolicy, secondGroupingPolicy],
      );

      const roleMetadataDao: RoleMetadataDao = {
        roleEntityRef: 'role:default/dev-team',
        source: 'rest',
        author: modifiedBy,
        modifiedBy: 'user:default/system-admin',
      };
      await enfDelegate.updateGroupingPolicies(
        [groupingPolicy, secondGroupingPolicy],
        [groupingPolicy],
        roleMetadataDao,
      );

      const storedPolicies = await enfDelegate.getGroupingPolicy();
      expect(storedPolicies.length).toEqual(1);

      expect(enfRemoveGroupingPoliciesSpy).toHaveBeenCalledWith([
        [...groupingPolicy, 'rest'],
        [...secondGroupingPolicy, 'rest'],
      ]);
      expect(enfAddGroupingPoliciesSpy).toHaveBeenCalledWith([
        [...groupingPolicy, 'rest'],
      ]);

      const metadata = (roleMetadataStorageMock.updateRoleMetadata as jest.Mock)
        .mock.calls[0][0];

      const createdAtData = new Date(`${metadata.createdAt}`);
      const lastModified = new Date(`${metadata.lastModified}`);
      expect(lastModified > createdAtData).toBeTruthy();
      expect(metadata.author).toEqual(modifiedBy);
      expect(metadata.description).toEqual('Role for dev engineers');
      expect(metadata.modifiedBy).toEqual('user:default/system-admin');
      expect(metadata.roleEntityRef).toEqual('role:default/dev-team');
      expect(metadata.source).toEqual('rest');
    });

    it('should update grouping policies: one policy should be removed and description updated', async () => {
      roleMetadataStorageMock.findRoleMetadata = jest
        .fn()
        .mockImplementation(async (): Promise<RoleMetadataDao> => {
          return {
            source: 'rest',
            roleEntityRef: 'role:default/dev-team',
            author: 'user:default/some-user',
            modifiedBy: 'user:default/some-user',
            description: 'Role for dev engineers',
            createdAt: '2024-03-01 00:23:41+00',
          };
        });

      const enfDelegate = await createEnfDelegate(
        [],
        [groupingPolicy, secondGroupingPolicy],
      );

      const roleMetadataDao: RoleMetadataDao = {
        roleEntityRef: 'role:default/dev-team',
        source: 'rest',
        author: modifiedBy,
        modifiedBy: 'user:default/system-admin',
        description: 'updated description',
      };
      await enfDelegate.updateGroupingPolicies(
        [groupingPolicy, secondGroupingPolicy],
        [groupingPolicy],
        roleMetadataDao,
      );

      const storedPolicies = await enfDelegate.getGroupingPolicy();
      expect(storedPolicies.length).toEqual(1);

      expect(enfRemoveGroupingPoliciesSpy).toHaveBeenCalledWith([
        [...groupingPolicy, 'rest'],
        [...secondGroupingPolicy, 'rest'],
      ]);
      expect(enfAddGroupingPoliciesSpy).toHaveBeenCalledWith([
        [...groupingPolicy, 'rest'],
      ]);

      const metadata = (roleMetadataStorageMock.updateRoleMetadata as jest.Mock)
        .mock.calls[0][0];

      const createdAtData = new Date(`${metadata.createdAt}`);
      const lastModified = new Date(`${metadata.lastModified}`);
      expect(lastModified > createdAtData).toBeTruthy();
      expect(metadata.author).toEqual('user:default/some-user');
      expect(metadata.description).toEqual('updated description');
      expect(metadata.modifiedBy).toEqual('user:default/system-admin');
      expect(metadata.roleEntityRef).toEqual('role:default/dev-team');
      expect(metadata.source).toEqual('rest');
    });

    it('should update grouping policies: role should be renamed', async () => {
      const oldRoleName = 'role:default/dev-team';
      roleMetadataStorageMock.findRoleMetadata = jest
        .fn()
        .mockImplementation(async (): Promise<RoleMetadataDao> => {
          return {
            source: 'rest',
            roleEntityRef: oldRoleName,
            author: modifiedBy,
            modifiedBy,
            description: 'Role for dev engineers',
            createdAt: '2024-03-01 00:23:41+00',
          };
        });

      const enfDelegate = await createEnfDelegate(
        [],
        [groupingPolicy, secondGroupingPolicy],
      );

      const newRoleName = 'role:default/new-team-name';
      const groupingPolicyWithRenamedRole = [
        'user:default/tom',
        newRoleName,
        'rest',
      ];
      const secondGroupingPolicyWithRenamedRole = [
        'user:default/tim',
        newRoleName,
        'rest',
      ];

      const roleMetadataDao: RoleMetadataDao = {
        roleEntityRef: newRoleName,
        source: 'rest',
        modifiedBy,
      };
      await enfDelegate.updateGroupingPolicies(
        [groupingPolicy, secondGroupingPolicy],
        [groupingPolicyWithRenamedRole, secondGroupingPolicyWithRenamedRole],
        roleMetadataDao,
      );

      const storedPolicies = await enfDelegate.getGroupingPolicy();
      expect(storedPolicies.length).toEqual(2);
      expect(storedPolicies[0]).toEqual([
        ...groupingPolicyWithRenamedRole,
        'rest',
      ]);
      expect(storedPolicies[1]).toEqual([
        ...secondGroupingPolicyWithRenamedRole,
        'rest',
      ]);

      expect(enfRemoveGroupingPoliciesSpy).toHaveBeenCalledWith([
        [...groupingPolicy, 'rest'],
        [...secondGroupingPolicy, 'rest'],
      ]);
      expect(enfAddGroupingPoliciesSpy).toHaveBeenCalledWith([
        [...groupingPolicyWithRenamedRole, 'rest'],
        [...secondGroupingPolicyWithRenamedRole, 'rest'],
      ]);

      const metadata = (roleMetadataStorageMock.updateRoleMetadata as jest.Mock)
        .mock.calls[0][0];

      const createdAtData = new Date(`${metadata.createdAt}`);
      const lastModified = new Date(`${metadata.lastModified}`);
      expect(lastModified > createdAtData).toBeTruthy();
      expect(metadata.author).toEqual(modifiedBy);
      expect(metadata.description).toEqual('Role for dev engineers');
      expect(metadata.modifiedBy).toEqual(modifiedBy);
      expect(metadata.roleEntityRef).toEqual(newRoleName);
      expect(metadata.source).toEqual('rest');
    });

    it('should update grouping policies: should be updated role description and source', async () => {
      roleMetadataStorageMock.findRoleMetadata = jest
        .fn()
        .mockImplementation(async (): Promise<RoleMetadataDao> => {
          return {
            source: 'legacy',
            roleEntityRef: 'role:default/dev-team',
            author: modifiedBy,
            description: 'Role for dev engineers',
            createdAt: '2024-03-01 00:23:41+00',
            modifiedBy,
          };
        });

      const enfDelegate = await createEnfDelegate(
        [],
        [groupingPolicy],
        'legacy',
      );

      const roleMetadataDao: RoleMetadataDao = {
        roleEntityRef: 'role:default/dev-team',
        source: 'rest',
        modifiedBy,
        description: 'some-new-description',
      };
      await enfDelegate.updateGroupingPolicies(
        [groupingPolicy],
        [groupingPolicy],
        roleMetadataDao,
      );

      const storedPolicies = await enfDelegate.getGroupingPolicy();
      expect(storedPolicies.length).toEqual(1);
      expect(storedPolicies).toEqual([[...groupingPolicy, 'rest']]);

      const metadata = (roleMetadataStorageMock.updateRoleMetadata as jest.Mock)
        .mock.calls[0][0];

      const createdAtData = new Date(`${metadata.createdAt}`);
      const lastModified = new Date(`${metadata.lastModified}`);
      expect(lastModified > createdAtData).toBeTruthy();
      expect(metadata.author).toEqual(modifiedBy);
      expect(metadata.description).toEqual('some-new-description');
      expect(metadata.modifiedBy).toEqual(modifiedBy);
      expect(metadata.roleEntityRef).toEqual('role:default/dev-team');
      expect(metadata.source).toEqual('rest');
    });
  });

  describe('updatePolicies', () => {
    it('should be updated single policy', async () => {
      const enfDelegate = await createEnfDelegate([policy]);
      enfAddPolicySpy.mockClear();
      enfRemovePoliciesSpy.mockClear();

      const newPolicy = ['user:default/tom', 'policy-entity', 'read', 'deny'];

      await enfDelegate.updatePolicies([policy], [newPolicy], 'rest');

      expect(enfRemovePoliciesSpy).toHaveBeenCalledWith([[...policy, 'rest']]);
      expect(enfAddPoliciesSpy).toHaveBeenCalledWith([[...newPolicy, 'rest']]);
    });

    it('should be added few policies', async () => {
      const enfDelegate = await createEnfDelegate([policy, secondPolicy]);
      enfAddPolicySpy.mockClear();
      enfRemovePoliciesSpy.mockClear();

      const newPolicy1 = ['user:default/tom', 'policy-entity', 'read', 'deny'];
      const newPolicy2 = [
        'user:default/tim',
        'catalog-entity',
        'write',
        'allow',
      ];

      await enfDelegate.updatePolicies(
        [policy, secondPolicy],
        [newPolicy1, newPolicy2],
        'rest',
      );

      expect(enfRemovePoliciesSpy).toHaveBeenCalledWith([
        [...policy, 'rest'],
        [...secondPolicy, 'rest'],
      ]);
      expect(enfAddPoliciesSpy).toHaveBeenCalledWith([
        [...newPolicy1, 'rest'],
        [...newPolicy2, 'rest'],
      ]);
    });
  });

  describe('removePolicy', () => {
    const policyToDelete = [
      'user:default/some-user',
      'catalog-entity',
      'read',
      'allow',
      'rest',
    ];

    it('policy should be removed', async () => {
      const enfDelegate = await createEnfDelegate([policyToDelete]);
      await enfDelegate.removePolicy(policyToDelete, 'rest');

      expect(enfRemovePolicySpy).toHaveBeenCalledWith(
        ...policyToDelete,
        'rest',
      );
    });
  });

  describe('removePolicies', () => {
    const policiesToDelete = [
      ['user:default/some-user', 'catalog-entity', 'read', 'allow'],
      ['user:default/some-user-2', 'catalog-entity', 'read', 'allow'],
    ];
    it('policies should be removed', async () => {
      const enfDelegate = await createEnfDelegate(policiesToDelete);
      await enfDelegate.removePolicies(policiesToDelete, 'rest');

      expect(enfRemovePoliciesSpy).toHaveBeenCalledWith(
        policiesToDelete.map(p => [...p, 'rest']),
      );
    });
  });

  describe('removeGroupingPolicy', () => {
    const groupingPolicyToDelete = [
      'user:default/some-user',
      'role:default/team-dev',
    ];

    beforeEach(() => {
      roleMetadataStorageMock.findRoleMetadata = jest
        .fn()
        .mockImplementation(() => {
          return {
            source: 'rest',
            roleEntityRef: 'role:default/team-dev',
            createdAt: '2024-03-01 00:23:41+00',
          };
        });
    });

    it('should remove grouping policy and remove role metadata', async () => {
      const enfDelegate = await createEnfDelegate([], [groupingPolicyToDelete]);
      await enfDelegate.removeGroupingPolicy(
        groupingPolicyToDelete,
        { source: 'rest', roleEntityRef: 'role:default/team-dev', modifiedBy },
        false,
      );

      expect(roleMetadataStorageMock.findRoleMetadata).toHaveBeenCalledTimes(1);
      expect(enfFilterGroupingPolicySpy).toHaveBeenCalledTimes(1);

      expect(roleMetadataStorageMock.removeRoleMetadata).toHaveBeenCalledWith(
        'role:default/team-dev',
        expect.anything(),
      );
    });

    it('should remove grouping policy and update role metadata', async () => {
      const enfDelegate = await createEnfDelegate(
        [],
        [
          groupingPolicyToDelete,
          ['group:default/team-a', 'role:default/team-dev'],
        ],
      );
      await enfDelegate.removeGroupingPolicy(
        groupingPolicyToDelete,
        { source: 'rest', roleEntityRef: 'role:default/team-dev', modifiedBy },
        false,
      );

      expect(roleMetadataStorageMock.findRoleMetadata).toHaveBeenCalledTimes(1);
      expect(enfFilterGroupingPolicySpy).toHaveBeenCalledTimes(1);

      const metadata = (roleMetadataStorageMock.updateRoleMetadata as jest.Mock)
        .mock.calls[0][0];

      const createdAtData = new Date(`${metadata.createdAt}`);
      const lastModified = new Date(`${metadata.lastModified}`);
      expect(lastModified > createdAtData).toBeTruthy();

      expect(metadata.roleEntityRef).toEqual('role:default/team-dev');
      expect(metadata.source).toEqual('rest');
    });

    it('should remove grouping policy and not update or remove role metadata, because isUpdate flag set to true', async () => {
      const enfDelegate = await createEnfDelegate([], [groupingPolicyToDelete]);
      await enfDelegate.removeGroupingPolicy(
        groupingPolicyToDelete,
        {
          source: 'rest',
          roleEntityRef: 'role:default/dev-team',
          modifiedBy: 'user:default/some-user',
        },
        true,
      );

      expect(enfRemoveGroupingPolicySpy).toHaveBeenCalledWith(
        ...groupingPolicyToDelete,
        'rest',
      );

      expect(roleMetadataStorageMock.findRoleMetadata).not.toHaveBeenCalled();
      expect(enfFilterGroupingPolicySpy).not.toHaveBeenCalled();
      expect(roleMetadataStorageMock.removeRoleMetadata).not.toHaveBeenCalled();
      expect(roleMetadataStorageMock.updateRoleMetadata).not.toHaveBeenCalled();
    });
  });

  describe('removeGroupingPolicies', () => {
    const groupingPoliciesToDelete = [
      ['user:default/some-user', 'role:default/team-dev'],
      ['group:default/team-a', 'role:default/team-dev'],
    ];

    it('should remove grouping policies and remove role metadata', async () => {
      roleMetadataStorageMock.findRoleMetadata = jest
        .fn()
        .mockImplementation(() => {
          return {
            source: 'rest',
            roleEntityRef: 'role:default/team-dev',
          };
        });
      enfRemoveGroupingPoliciesSpy.mockReset();
      enfFilterGroupingPolicySpy.mockReset();

      const enfDelegate = await createEnfDelegate([], groupingPoliciesToDelete);
      await enfDelegate.removeGroupingPolicies(
        groupingPoliciesToDelete,
        {
          roleEntityRef: 'role:default/team-dev',
          source: 'rest',
          modifiedBy,
        },
        false,
      );

      expect(enfRemoveGroupingPoliciesSpy).toHaveBeenCalledWith(
        groupingPoliciesToDelete.map(p => [...p, 'rest']),
      );

      expect(roleMetadataStorageMock.findRoleMetadata).toHaveBeenCalledTimes(1);
      expect(enfFilterGroupingPolicySpy).toHaveBeenCalledTimes(1);

      expect(roleMetadataStorageMock.removeRoleMetadata).toHaveBeenCalledWith(
        'role:default/team-dev',
        expect.anything(),
      );
    });

    it('should remove grouping policies and update role metadata', async () => {
      roleMetadataStorageMock.findRoleMetadata = jest
        .fn()
        .mockImplementation(() => {
          return {
            source: 'rest',
            roleEntityRef: 'role:default/team-dev',
            createdAt: '2024-03-01 00:23:41+00',
          };
        });
      enfRemoveGroupingPoliciesSpy.mockReset();
      enfFilterGroupingPolicySpy.mockReset();

      const remainingGroupPolicy = [
        'user:default/some-user-2',
        'role:default/team-dev',
      ];
      const enfDelegate = await createEnfDelegate(
        [],
        [...groupingPoliciesToDelete, remainingGroupPolicy],
      );
      await enfDelegate.removeGroupingPolicies(
        groupingPoliciesToDelete,
        {
          roleEntityRef: 'role:default/team-dev',
          source: 'rest',
          modifiedBy,
        },
        false,
      );

      expect(enfRemoveGroupingPoliciesSpy).toHaveBeenCalledWith(
        groupingPoliciesToDelete.map(p => [...p, 'rest']),
      );

      expect(roleMetadataStorageMock.findRoleMetadata).toHaveBeenCalledTimes(1);
      expect(enfFilterGroupingPolicySpy).toHaveBeenCalledTimes(1);

      const metadata = (roleMetadataStorageMock.updateRoleMetadata as jest.Mock)
        .mock.calls[0][0];

      const createdAtData = new Date(`${metadata.createdAt}`);
      const lastModified = new Date(`${metadata.lastModified}`);
      expect(lastModified > createdAtData).toBeTruthy();

      expect(metadata.roleEntityRef).toEqual('role:default/team-dev');
      expect(metadata.source).toEqual('rest');
    });

    it('should remove grouping policy and not update or remove role metadata, because isUpdate flag set to true', async () => {
      roleMetadataStorageMock.findRoleMetadata = jest
        .fn()
        .mockImplementation(() => {
          return {
            source: 'rest',
            roleEntityRef: 'role:default/team-dev',
          };
        });
      enfRemoveGroupingPoliciesSpy.mockReset();
      enfFilterGroupingPolicySpy.mockReset();

      const enfDelegate = await createEnfDelegate([], groupingPoliciesToDelete);
      await enfDelegate.removeGroupingPolicies(
        groupingPoliciesToDelete,
        {
          roleEntityRef: 'role:default/team-dev',
          source: 'rest',
          modifiedBy: 'user:default/test-user',
        },
        true,
      );

      expect(enfRemoveGroupingPoliciesSpy).toHaveBeenCalledWith(
        groupingPoliciesToDelete.map(p => [...p, 'rest']),
      );

      expect(roleMetadataStorageMock.findRoleMetadata).not.toHaveBeenCalled();
      expect(enfFilterGroupingPolicySpy).not.toHaveBeenCalled();
      expect(roleMetadataStorageMock.removeRoleMetadata).not.toHaveBeenCalled();
      expect(roleMetadataStorageMock.updateRoleMetadata).not.toHaveBeenCalled();
    });
  });

  describe('addOrUpdatePolicy', () => {
    it('should add policy', async () => {
      const enfDelegate = await createEnfDelegate([]);
      enfAddPolicySpy.mockClear();

      await enfDelegate.addOrUpdatePolicy(policy, 'rest');

      expect(enfAddPolicySpy).toHaveBeenCalledWith(...policy, 'rest');
    });

    it('should update legacy policy', async () => {
      const enfDelegate = await createEnfDelegate([policy], [], 'legacy');
      enfAddPolicySpy.mockClear();

      await enfDelegate.addOrUpdatePolicy(policy, 'rest');

      expect(enfRemovePolicySpy).toHaveBeenCalledWith(...policy, 'legacy');
      expect(enfAddPolicySpy).toHaveBeenCalledWith(...policy, 'rest');
    });
  });

  describe('addOrUpdateGroupingPolicy', () => {
    it('should add grouping policy and create role metadata for method addOrUpdateGroupingPolicy', async () => {
      (roleMetadataStorageMock.findRoleMetadata as jest.Mock).mockReturnValue(
        Promise.resolve(undefined),
      );

      const enfDelegate = await createEnfDelegate();

      await enfDelegate.addOrUpdateGroupingPolicy(groupingPolicy, {
        source: 'rest',
        roleEntityRef: 'role:default/dev-team',
        modifiedBy,
      });

      expect(enfAddGroupingPolicySpy).toHaveBeenCalledWith(
        ...groupingPolicy,
        'rest',
      );
      expect(roleMetadataStorageMock.createRoleMetadata).toHaveBeenCalled();
      expect(
        (roleMetadataStorageMock.createRoleMetadata as jest.Mock).mock.calls
          .length,
      ).toEqual(1);
      const metadata: RoleMetadataDao = (
        roleMetadataStorageMock.createRoleMetadata as jest.Mock
      ).mock.calls[0][0];
      const createdAtData = new Date(`${metadata.createdAt}`);
      const lastModified = new Date(`${metadata.lastModified}`);
      expect(lastModified).toEqual(createdAtData);

      expect(metadata.source).toEqual('rest');
      expect(metadata.roleEntityRef).toEqual('role:default/dev-team');
    });

    it('should add grouping policy and update role metadata', async () => {
      roleMetadataStorageMock.findRoleMetadata = jest
        .fn()
        .mockImplementation(() => {
          return {
            source: 'rest',
            roleEntityRef: 'role:default/dev-team',
            createdAt: '2024-03-01 00:23:41+00',
          };
        });

      const enfDelegate = await createEnfDelegate([], [groupingPolicy]);

      await enfDelegate.addOrUpdateGroupingPolicy(secondGroupingPolicy, {
        source: 'rest',
        roleEntityRef: 'role:default/dev-team',
        modifiedBy,
      });

      expect(enfAddGroupingPolicySpy).toHaveBeenCalledWith(
        ...secondGroupingPolicy,
        'rest',
      );
      expect(roleMetadataStorageMock.updateRoleMetadata).toHaveBeenCalled();
      expect(
        (roleMetadataStorageMock.updateRoleMetadata as jest.Mock).mock.calls
          .length,
      ).toEqual(1);
      const metadata: RoleMetadataDao = (
        roleMetadataStorageMock.updateRoleMetadata as jest.Mock
      ).mock.calls[0][0];
      const createdAtData = new Date(`${metadata.createdAt}`);
      const lastModified = new Date(`${metadata.lastModified}`);
      expect(lastModified > createdAtData).toBeTruthy();

      expect(metadata.source).toEqual('rest');
      expect(metadata.roleEntityRef).toEqual('role:default/dev-team');
    });

    it('should update grouping policy with legacy value', async () => {
      (roleMetadataStorageMock.findRoleMetadata as jest.Mock).mockReturnValue(
        Promise.resolve({
          roleEntityRef: 'role:default/dev-team',
          source: 'legacy',
          createdAt: '2024-03-01 00:23:41+00',
        }),
      );

      const enfDelegate = await createEnfDelegate(
        [],
        [groupingPolicy],
        'legacy',
      );

      await enfDelegate.addOrUpdateGroupingPolicy(groupingPolicy, {
        source: 'rest',
        roleEntityRef: 'role:default/dev-team',
        modifiedBy,
      });

      const metadata: RoleMetadataDao = (
        roleMetadataStorageMock.updateRoleMetadata as jest.Mock
      ).mock.calls[0][0];
      const createdAtData = new Date(`${metadata.createdAt}`);
      const lastModified = new Date(`${metadata.lastModified}`);
      expect(lastModified > createdAtData).toBeTruthy();

      expect(metadata.source).toEqual('rest');
      expect(metadata.roleEntityRef).toEqual('role:default/dev-team');
      expect(enfRemoveGroupingPolicySpy).toHaveBeenCalledWith(
        ...groupingPolicy,
        'legacy',
      );

      expect(roleMetadataStorageMock.createRoleMetadata).not.toHaveBeenCalled();
      expect(roleMetadataStorageMock.removeRoleMetadata).not.toHaveBeenCalled();

      expect(enfAddGroupingPolicySpy).toHaveBeenCalledTimes(1);
    });
  });
});
