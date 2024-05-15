// import {
//   AuthorizeResult,
//   ConditionalPolicyDecision,
//   ResourcePermission,
// } from '@backstage/plugin-permission-common';
// import { PolicyQuery } from '@backstage/plugin-permission-node';
// import * as util from 'util';
// import { Logger } from 'winston';

// import {
//   ActorDetails,
//   AuditLogDetails,
// } from '@janus-idp/backstage-plugin-audit-log-common';
import { AuditLogOptions } from '@janus-idp/backstage-plugin-audit-log-common';
import {
  RoleMetadata,
  // PermissionAction,
  // PermissionInfo,
  // RoleConditionalPolicyDecision,
  Source,
  // toPermissionAction,
} from '@janus-idp/backstage-plugin-rbac-common';

import { RoleMetadataDao } from '../database/role-metadata';

// import { RoleMetadataDao } from '../database/role-metadata';

export enum RoleEvents {
  CreateRole = 'CreateRole',
  UpdateRole = 'UpdateRole',
  DeleteRole = 'DeleteRole',
}
export type Operation = 'CREATE' | 'UPDATE' | 'DELETE';

export type RoleAuditInfo = {
  roleEntityRef: string;
  description?: string;
  members: string[];
  source: Source;
  operation: Operation;
};

const stage = 'metadata';

export function createAuditRoleOptions(
  operation: Operation,
  metadata: RoleMetadataDao,
  groupPolicies: string[][],
): AuditLogOptions {
  let message: string;
  let eventName: string;
  switch (operation) {
    case 'CREATE':
      message = `Created '${metadata.roleEntityRef}'`;
      eventName = RoleEvents.CreateRole;
      break;
    case 'UPDATE':
      message = `Updated '${metadata.roleEntityRef}'`;
      eventName = RoleEvents.UpdateRole;
      break;
    case 'DELETE':
      message = `Deleted '${metadata.roleEntityRef}'`;
      eventName = RoleEvents.DeleteRole;
      break;
    default:
      throw new Error(`Unexpected audit log operation: ${operation}`);
  }

  const members = groupPolicies.map(p => p[0]) ?? [];

  const auditInfo: RoleAuditInfo = {
    roleEntityRef: metadata.roleEntityRef,
    operation,
    source: metadata.source,
    description: metadata.description ?? '',
    members: members,
  };

  return {
    message,
    eventName: `${eventName.toString()}`,
    stage,
    metadata: auditInfo,
    actor_id: metadata.modifiedBy || metadata.author,
  };
}

// type RoleAuditLog = AuditLogDetails & {
//   meta: RoleInfo;
// };

// type LogMsgWithConditionInfo = LogMsg & {
//   pluginId: string;
//   resourceType: string;
// };

// type LogMsgWithEvaluationInfo = {
//   isAuditLog: true;
//   userEntityRef: string;
//   permissionName: string;
//   action: PermissionAction;
//   resourceType?: string;
//   result?: AuthorizeResult;
//   time: string;
//   condition?: string;
// };

// class UnknownErrorWrapper extends Error {
//   constructor(message: string) {
//     super(message);
//     this.name = this.constructor.name;
//     Error.captureStackTrace(this, this.constructor);
//   }
// }

// export class AuditLogger {
//   constructor(private readonly logger: Logger) {}

// roleInfo(
//   metadata: RoleMetadataDao,
//   actor: ActorDetails,
//   context: Source,
//   operation: Operation,
//   addedMembers?: string[],
//   removedMembers?: string[],
// ) {
//   const logMsg: RoleAuditLog = {
//     eventName: `${operation.toLocaleLowerCase()}Role`,
//     status: 'succeeded',
//     actor,
//     meta: {
//       roleEntityRef: metadata.roleEntityRef,
//       context,
//       roleDescription: metadata.description,
//       addedMembers,
//       removedMembers,
//       operation,
//     },
//     isAuditLog: true,
//   };

//   this.logger.info(
//     `${this.fmtToPastTime(operation)} '${metadata.roleEntityRef}' ${JSON.stringify(logMsg)}`,
//   );
// }

// roleError(
//   roleEntityRefs: string | string[],
//   operation: Operation[],
//   error: Error | unknown,
//   source: Source,
//   modifiedBy?: string,
// ) {
//   const e =
//     error instanceof Error
//       ? error
//       : new UnknownErrorWrapper('Unknown error occurred');

//   const msg: auditLog = {
//     isAuditLog: true,
//     entityRef: roleEntityRefs,
//     source,
//     modifiedBy,
//   };
//   this.logger.error(
//     `Fail to ${operation} '${JSON.stringify(roleEntityRefs)}'. Cause: ${
//       e.message
//     }. Stack trace: ${e.stack}`,
//     msg,
//   );
// }

// permissionInfo(
//   policies: string[][],
//   operation: Operation,
//   source: Source,
//   modifiedBy: string,
//   oldPolicies?: string[][],
// ) {
//   const entityRef = policies[0][0];
//   let message = `${this.fmtToPastTime(
//     operation,
//   )} permission policies ${JSON.stringify(policies)} for '${entityRef}'`;

//   if (operation === 'UPDATE') {
//     message = `${this.fmtToPastTime(
//       operation,
//     )} permission policies from ${JSON.stringify(
//       policies,
//     )} to ${JSON.stringify(oldPolicies)} for '${entityRef}'`;
//   }

//   const msgMeta: LogMsg = {
//     isAuditLog: true,
//     entityRef,
//     source,
//     modifiedBy,
//   };
//   this.logger.info(message, msgMeta);
// }

// permissionError(
//   policies: string[][],
//   operations: Operation[],
//   source: Source,
//   modifiedBy: string,
//   error: Error | unknown,
// ) {
//   const e =
//     error instanceof Error
//       ? error
//       : new UnknownErrorWrapper('Unknown error occurred');
//   const msg: LogMsg = {
//     isAuditLog: true,
//     entityRef: policies[0][0],
//     source,
//     modifiedBy,
//   };

//   this.logger.error(
//     `Fail to ${operations} permission policy: '${JSON.stringify(
//       policies,
//     )}'. Cause: ${e.message}. Stack trace: ${e.stack}`,
//     msg,
//   );
// }

// conditionInfo(
//   condition: RoleConditionalPolicyDecision<PermissionInfo>,
//   operation: Operation,
//   modifiedBy: string,
// ) {
//   const msg: LogMsgWithConditionInfo = {
//     isAuditLog: true,
//     entityRef: condition.roleEntityRef,
//     source: 'rest',
//     modifiedBy,
//     pluginId: condition.pluginId,
//     resourceType: condition.resourceType,
//   };

//   this.logger.info(
//     `${this.fmtToPastTime(operation)} condition '${JSON.stringify(
//       condition.conditions,
//     )}' for permissions: '${JSON.stringify(condition.permissionMapping)}'`,
//     msg,
//   );
// }

// conditionError(
//   conditionOrId: RoleConditionalPolicyDecision<PermissionInfo> | number,
//   operation: Operation,
//   modifiedBy: string,
//   error: Error | unknown,
// ) {
//   const e =
//     error instanceof Error
//       ? error
//       : new UnknownErrorWrapper('Unknown error occurred');

//   let entityRef;
//   let msg;
//   if (typeof conditionOrId === 'number') {
//     entityRef = 'no information';
//     msg = `Fail to ${operation.toLowerCase()} condition with id '${conditionOrId}'. Cause: ${
//       e.message
//     }. Stack trace: ${e.stack}`;
//   } else {
//     entityRef = conditionOrId.roleEntityRef;
//     msg = `Fail to ${operation.toLowerCase()} condition '${JSON.stringify(
//       conditionOrId,
//     )}'. Cause: ${e.message}. Stack trace: ${e.stack}`;
//   }

//   const logMsg: LogMsg = {
//     isAuditLog: true,
//     entityRef,
//     source: 'rest',
//     modifiedBy,
//   };
//   this.logger.error(msg, logMsg);
// }

// logEvaluation(
//   level: 'info' | 'error' = 'info',
//   message: string,
//   userEntityRef: string,
//   request: PolicyQuery,
//   result?: AuthorizeResult,
//   condition?: ConditionalPolicyDecision,
// ) {
//   const resourceType = (request.permission as ResourcePermission)
//     .resourceType;

//   const logMsg: LogMsgWithEvaluationInfo = {
//     isAuditLog: true,
//     time: '',
//     userEntityRef,
//     permissionName: request.permission.name,
//     action: toPermissionAction(request.permission.attributes),
//     result,
//   };

//   if (result) {
//     logMsg.result = result;
//   }
//   if (resourceType) {
//     logMsg.resourceType = resourceType;
//   }
//   if (condition) {
//     logMsg.condition = JSON.stringify(condition);
//   }

//   if (level === 'error') {
//     this.logger.error(message, logMsg);
//   } else {
//     this.logger.info(message, logMsg);
//   }
// }

// private fmtToPastTime(operation: Operation): string {
//   let result = '';
//   switch (operation) {
//     case 'CREATE':
//       result = 'Created';
//       break;
//     case 'UPDATE':
//       result = 'Updated';
//       break;
//     case 'DELETE':
//       result = 'Deleted';
//       break;
//     default: // do nothing;
//   }
//   return result;
// }
// }
