import { Router } from 'express';

import {
  PluginEndpointProvider,
  PolicyBuilder,
} from '@janus-idp/plugin-rh-rbac-backend';

import { PluginEnvironment } from '../types';

export default async function createPlugin(
  env: PluginEnvironment,
  pluginEndpointProvider: PluginEndpointProvider,
): Promise<Router> {
  return PolicyBuilder.build({
    config: env.config,
    logger: env.logger,
    discovery: env.discovery,
    identity: env.identity,
    permissions: env.permissions,
    urlReader: env.reader,
    pluginEndpointProvider,
  });
}
