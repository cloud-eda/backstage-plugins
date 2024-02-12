import {
  PermissionPolicyMetadata,
  Source,
} from '@janus-idp/backstage-plugin-rbac-common';

import { metadataStringToPolicy, policyToString } from '../../helper';
import {
  PermissionPolicyMetadataDao,
  policyDAOToMetadata,
  PolicyMetadataStorage,
} from '../meta-data-storage';

export class DataBasePolicyMetadataInMemoryStorage
  implements PolicyMetadataStorage
{
  private policyMetaDataDAOs: PermissionPolicyMetadataDao[] = [];
  private index: number = 0;

  private increment(): number {
    return this.index++;
  }

  async findPolicyMetadataBySource(
    source: string,
  ): Promise<PermissionPolicyMetadataDao[]> {
    return this.policyMetaDataDAOs.filter(
      (dao: PermissionPolicyMetadataDao) => dao.source === source,
    );
  }

  async findPolicyMetadata(
    policy: string[],
  ): Promise<PermissionPolicyMetadata | undefined> {
    const result = this.policyMetaDataDAOs.find(
      (dao: PermissionPolicyMetadataDao) =>
        metadataStringToPolicy(dao.policy) === policy,
    );
    return result ? policyDAOToMetadata(result) : undefined;
  }

  async createPolicyMetadata(
    source: Source,
    policy: string[],
  ): Promise<number> {
    const dao: PermissionPolicyMetadataDao = {
      id: this.increment(),
      policy: policyToString(policy),
      source,
    };
    const length = this.policyMetaDataDAOs.push(dao);
    return length - 1;
  }

  async removePolicyMetadata(policy: string[]): Promise<void> {
    this.policyMetaDataDAOs = this.policyMetaDataDAOs.filter(
      dao => metadataStringToPolicy(dao.policy) !== policy,
    );
  }
}
