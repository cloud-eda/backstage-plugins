import { InputError, NotFoundError } from '@backstage/errors';

import { RoleMetadata } from '@janus-idp/backstage-plugin-rbac-common';

import {
  roleDAOToMetadata,
  RoleMetadataDao,
  RoleMetadataStorage,
} from '../meta-data-storage';

export class DataBaseRoleMetadataInMemoryStorage
  implements RoleMetadataStorage
{
  private roleMetaDataDAOs: RoleMetadataDao[] = [];
  private index: number = 0;

  private increment(): number {
    return this.index++;
  }

  async findRoleMetadata(
    roleEntityRef: string,
  ): Promise<RoleMetadata | undefined> {
    const result = this.roleMetaDataDAOs.find(
      (dao: RoleMetadataDao) => dao.roleEntityRef === roleEntityRef,
    );
    return result ? roleDAOToMetadata(result) : undefined;
  }

  async createRoleMetadata(
    roleMetadata: RoleMetadata,
    roleEntityRef: string,
  ): Promise<number> {
    const dao: RoleMetadataDao = {
      id: this.increment(),
      roleEntityRef,
      source: roleMetadata.source,
    };
    const length = this.roleMetaDataDAOs.push(dao);
    return length - 1;
  }

  async updateRoleMetadata(
    newRoleMetadataDao: RoleMetadataDao,
    oldRoleEntityRef: string,
  ): Promise<void> {
    const roleIndex = this.roleMetaDataDAOs.findIndex(
      role => role.roleEntityRef === oldRoleEntityRef,
    );
    if (roleIndex >= 0) {
      const role = this.roleMetaDataDAOs[roleIndex];
      if (
        role.source !== 'legacy' &&
        role.source !== newRoleMetadataDao.source
      ) {
        throw new InputError(`The RoleMetadata.source field is 'read-only'.`);
      }

      this.roleMetaDataDAOs[roleIndex] = newRoleMetadataDao;
      return;
    }

    throw new NotFoundError(
      `A metadata for role '${oldRoleEntityRef}' was not found`,
    );
  }

  async removeRoleMetadata(roleEntityRef: string): Promise<void> {
    this.roleMetaDataDAOs = this.roleMetaDataDAOs.filter(
      dao => dao.roleEntityRef !== roleEntityRef,
    );
  }
}
