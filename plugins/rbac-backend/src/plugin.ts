import { loggerToWinstonLogger } from '@backstage/backend-common';
import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';

// import * as util from 'util';
import { PolicyBuilder } from '@janus-idp/backstage-plugin-rbac-backend';
import {
  PluginIdProvider,
  PluginIdProviderExtensionPoint,
  pluginIdProviderExtensionPoint,
} from '@janus-idp/backstage-plugin-rbac-node';

// import { format } from 'winston';

/**
 * RBAC plugin
 *
 */
export const rbacPlugin = createBackendPlugin({
  pluginId: 'permission',
  register(env) {
    const pluginIdProviderExtensionPointImpl = new (class PluginIdProviderImpl
      implements PluginIdProviderExtensionPoint
    {
      pluginIdProviders: PluginIdProvider[] = [];

      addPluginIdProvider(pluginIdProvider: PluginIdProvider): void {
        this.pluginIdProviders.push(pluginIdProvider);
      }
    })();

    env.registerExtensionPoint(
      pluginIdProviderExtensionPoint,
      pluginIdProviderExtensionPointImpl,
    );

    env.registerInit({
      deps: {
        http: coreServices.httpRouter,
        config: coreServices.rootConfig,
        logger: coreServices.logger,
        discovery: coreServices.discovery,
        identity: coreServices.identity,
        permissions: coreServices.permissions,
        auth: coreServices.auth,
        httpAuth: coreServices.httpAuth,
      },
      async init({
        http,
        config,
        logger,
        discovery,
        identity,
        permissions,
        auth,
        httpAuth,
      }) {
        const winstonLogger = loggerToWinstonLogger(
          logger,
          // {
          // format: format.combine(
          //   format.timestamp(),
          //   format.printf(({ level, message, timestamp }) => {
          //     return `${timestamp} ${level}: ${message}`;
          //   })
          // )
          // }
        );

        // // Example TypeScript object
        // const myObject = { key1: 'value1', key2: 'value2', a: {a: 2}};

        // // Convert TypeScript object to string using util.inspect()
        // const objectString = JSON.stringify(myObject);

        // // Format the string if necessary using util.format()
        // const formattedString = util.format(objectString);

        // // Log the formatted string using Winston logger
        // logger.info(`some text ${formattedString}`);

        http.use(
          await PolicyBuilder.build(
            {
              config,
              logger: winstonLogger,
              discovery,
              identity,
              permissions,
              auth,
              httpAuth,
            },
            {
              getPluginIds: () =>
                Array.from(
                  new Set(
                    pluginIdProviderExtensionPointImpl.pluginIdProviders.flatMap(
                      p => p.getPluginIds(),
                    ),
                  ),
                ),
            },
          ),
        );
      },
    });
  },
});
