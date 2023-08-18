import {
  FetchUrlReader,
  PluginEndpointDiscovery,
  ReaderFactory,
} from '@backstage/backend-common';
import { findPaths } from '@backstage/cli-common';

import * as lockfile from '@yarnpkg/lockfile';

import fs from 'fs';

export interface PluginEndpointProvider {
  get(): Promise<string[]>;
}

export class PluginEndpointCollector implements PluginEndpointProvider {
  private readonly pluginIds: string[];
  private readonly orgPrefixes = ['@backstage/', '@janus-idp/'];
  private backendSuffixRegExp = new RegExp('-backend@.*$');

  constructor(private readonly discovery: PluginEndpointDiscovery) {
    this.pluginIds = this.getPluginIds();
  }

  async get(): Promise<string[]> {
    const endpoints: string[] = [];
    for (const pluginId of this.pluginIds) {
      const endpoint = await this.discovery.getBaseUrl(pluginId);
      endpoints.push(endpoint);
    }
    return endpoints;
  }

  static permissionFactory: ReaderFactory = () => {
    return [{ reader: new FetchUrlReader(), predicate: (_url: URL) => true }];
  };

  // Get list id for static plugins.
  private getPluginIds(): string[] {
    /* eslint-disable-next-line no-restricted-syntax */
    const paths = findPaths(__dirname);
    const lockfilePath = paths.resolveTargetRoot('yarn.lock');
    const file = fs.readFileSync(lockfilePath, 'utf8');
    const lockFileRaw = lockfile.parse(file);

    if (lockFileRaw.type !== 'success') {
      throw new Error(
        `Failed to parse yarn.lock file to get list backend plugins`,
      );
    }

    return this.getBackendPluginIds(Object.keys(lockFileRaw.object));
  }

  private getBackendPluginIds(deps: string[]): string[] {
    const backendPlugins = this.filterBackendPlugins(deps);

    return this.pasePluginIds(backendPlugins);
  }

  private filterBackendPlugins(deps: string[]): string[] {
    return deps.filter(dep => {
      const isOrgPrefixed = this.orgPrefixes.some(orgPrefix =>
        dep.startsWith(orgPrefix),
      );
      return isOrgPrefixed && this.backendSuffixRegExp.test(dep);
    });
  }

  private pasePluginIds(deps: string[]) {
    const prefixes = this.orgPrefixes.map(orgPrefix => `${orgPrefix}plugin-`);

    return deps
      .map(dep => {
        for (const prefix of prefixes) {
          if (dep.startsWith(prefix)) {
            return dep.slice(prefix.length);
          }
        }
        throw new Error(`Failed to parse plugin id for dependency ${dep}`);
      })
      .map(dep => dep.replace(this.backendSuffixRegExp, ''));
  }
}
