import { CatalogClient } from '@backstage/catalog-client';
import { Entity } from '@backstage/catalog-model';

export type FilterRelations = 'relations.hasMember' | 'relations.parentOf';

export class GroupInfoCollector {
  constructor(private readonly catalogClient: CatalogClient) {}

  async findAncestorGroup(
    entityRefs: string[],
    groupToSearch: string,
    fr: FilterRelations,
  ): Promise<Entity | undefined> {
    const { items } = await this.catalogClient.getEntities({
      filter: {
        kind: 'Group',
        [fr]: entityRefs,
      },
      // Save traffic with only required information for us
      fields: ['metadata.name', 'kind', 'metadata.namespace', 'spec.parent'],
    });

    const groupsRefs: string[] = [];
    for (const item of items) {
      const groupRef = `group:default/${item.metadata.name.toLocaleLowerCase()}`;
      if (groupRef === groupToSearch) {
        return item;
      }
      if (item.spec && item.spec.parent) {
        groupsRefs.push(groupRef);
      }
    }

    if (groupsRefs.length > 0) {
      return await this.findAncestorGroup(
        groupsRefs,
        groupToSearch,
        'relations.parentOf',
      );
    }

    return undefined;
  }
}
