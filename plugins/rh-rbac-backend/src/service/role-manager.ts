import { RoleManager } from 'casbin';

import { GroupSearcher } from './group-searcher';

export class BackstageRoleManager implements RoleManager {
  constructor(private readonly groupInfo: GroupSearcher) {}

  /**
   * clear clears all stored data and resets the role manager to the initial state.
   */
  async clear(): Promise<void> {
    // do nothing
  }

  /**
   * addLink adds the inheritance link between role: name1 and role: name2.
   * aka role: name1 inherits role: name2.
   * domain is a prefix to the roles.
   */
  addLink(_name1: string, _name2: string, ..._domain: string[]): Promise<void> {
    throw new Error('Method "addLink" not implemented.');
  }

  /**
   * deleteLink deletes the inheritance link between role: name1 and role: name2.
   * aka role: name1 does not inherit role: name2 any more.
   * domain is a prefix to the roles.
   */
  deleteLink(
    _name1: string,
    _name2: string,
    ..._domain: string[]
  ): Promise<void> {
    throw new Error('Method "deleteLink" not implemented.');
  }

  /**
   * hasLink determines whether role: name1 inherits role: name2.
   * domain is a prefix to the roles.
   */
  async hasLink(
    name1: string,
    name2: string,
    ...domain: string[]
  ): Promise<boolean> {
    if (domain.length > 0) {
      throw new Error('domain argument is not supported.');
    }

    if (name1 === name2) {
      return true;
    }

    const role = await this.groupInfo.findAncestorGroup(
      [name1],
      name2,
      'relations.hasMember',
    );
    return !!role;
  }

  /**
   * syncedHasLink determines whether role: name1 inherits role: name2.
   * domain is a prefix to the roles.
   */
  syncedHasLink?(
    _name1: string,
    _name2: string,
    ..._domain: string[]
  ): boolean {
    throw new Error('Method "syncedHasLink" not implemented.');
  }

  /**
   * getRoles gets the roles that a subject inherits.
   * domain is a prefix to the roles.
   */
  async getRoles(_name: string, ..._domain: string[]): Promise<string[]> {
    throw new Error('Method "getRoles" not implemented.');
  }

  /**
   * getUsers gets the users that inherits a subject.
   * domain is an unreferenced parameter here, may be used in other implementations.
   */
  async getUsers(_name: string, ..._domain: string[]): Promise<string[]> {
    throw new Error('Method "getUsers" not implemented.');
  }

  /**
   * printRoles prints all the roles to log.
   */
  async printRoles(): Promise<void> {
    // do nothing
  }
}
