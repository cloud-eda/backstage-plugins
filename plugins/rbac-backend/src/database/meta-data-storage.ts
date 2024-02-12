import { Knex } from 'knex';

import {
  PermissionPolicyMetadata,
  RoleMetadata,
  Source,
} from '@janus-idp/backstage-plugin-rbac-common';

export interface PermissionPolicyMetadataDao extends PermissionPolicyMetadata {
  id: number;
  policy: string;
}

export interface PolicyMetadataStorage {
  findPolicyMetadataBySource(
    source: string,
    trx?: Knex.Transaction,
  ): Promise<PermissionPolicyMetadataDao[]>;
  findPolicyMetadata(
    policy: string[],
    trx?: Knex.Transaction,
  ): Promise<PermissionPolicyMetadata | undefined>;

  createPolicyMetadata(
    source: Source,
    policy: string[],
    trx: Knex.Transaction,
  ): Promise<number>;

  removePolicyMetadata(policy: string[], trx: Knex.Transaction): Promise<void>;
}

export interface RoleMetadataDao extends RoleMetadata {
  id?: number;
  roleEntityRef: string;
}

export interface RoleMetadataStorage {
  findRoleMetadata(
    roleEntityRef: string,
    trx?: Knex.Transaction,
  ): Promise<RoleMetadata | undefined>;

  createRoleMetadata(
    roleMetadata: RoleMetadata,
    roleEntityRef: string,
    trx: Knex.Transaction,
  ): Promise<number>;

  updateRoleMetadata(
    roleMetadata: RoleMetadataDao,
    roleEntityRef: string,
    trx: Knex.Transaction,
  ): Promise<void>;

  removeRoleMetadata(
    roleEntityRef: string,
    trx: Knex.Transaction,
  ): Promise<void>;
}
