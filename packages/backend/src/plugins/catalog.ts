import { CatalogBuilder } from '@backstage/plugin-catalog-backend';
import { MicrosoftGraphOrgEntityProvider } from '@backstage/plugin-catalog-backend-module-msgraph';
import { ScaffolderEntitiesProcessor } from '@backstage/plugin-scaffolder-backend';

import { Router } from 'express';

import { PluginEnvironment } from '../types';

export default async function createPlugin(
  env: PluginEnvironment,
): Promise<Router> {
  const builder = await CatalogBuilder.create(env);
  builder.addProcessor(new ScaffolderEntitiesProcessor());
  builder.addEntityProvider(
    MicrosoftGraphOrgEntityProvider.fromConfig(env.config, {
      logger: env.logger,
      schedule: env.scheduler.createScheduledTaskRunner({
        frequency: { hours: 1 },
        timeout: { minutes: 50 },
        initialDelay: { seconds: 15 },
      }),
    }),
  );
  const { processingEngine, router } = await builder.build();
  await processingEngine.start();
  return router;
}
