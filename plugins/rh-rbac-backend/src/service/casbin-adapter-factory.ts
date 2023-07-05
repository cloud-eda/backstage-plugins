import { PluginDatabaseManager } from '@backstage/backend-common';
import { ConfigApi } from '@backstage/core-plugin-api';

import { Adapter } from 'casbin';
import TypeORMAdapter from 'typeorm-adapter';

export interface AdapterFactory {
  createAdapter(): Promise<Adapter>;
}

export class CasbinAdapterFactory implements AdapterFactory {
  public constructor(
    private readonly config: ConfigApi,
    private readonly databaseManager: PluginDatabaseManager,
  ) {}

  public async createAdapter(): Promise<Adapter> {
    const databaseConfig = this.config.getOptionalConfig('backend.database');
    const client = databaseConfig?.getOptionalString('client');

    let adapter;
    if (client === 'pg') {
      const knexClient = await this.databaseManager.getClient();
      const database = await knexClient.client.config.connection.database;
      adapter = await TypeORMAdapter.newAdapter({
        type: 'postgres',
        host: databaseConfig?.getString('connection.host'),
        port: databaseConfig?.getNumber('connection.port'),
        username: databaseConfig?.getString('connection.user'),
        password: databaseConfig?.getString('connection.password'),
        database,
      });
    }

    if (client === 'better-sqlite3') {
      // Storage type or path to the storage.
      const storage = databaseConfig?.getString('connection') || ':memory:';
      adapter = await TypeORMAdapter.newAdapter({
        type: 'better-sqlite3',
        database: storage,
      });
    }

    if (!adapter) {
      throw new Error(`Unsupported database client ${client}`);
    }

    return adapter;
  }
}
