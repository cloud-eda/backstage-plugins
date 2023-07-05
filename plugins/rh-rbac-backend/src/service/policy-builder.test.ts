// import { getVoidLogger } from '@backstage/backend-common';
import { getVoidLogger } from '@backstage/backend-common';
import { ConfigReader } from '@backstage/config';
import { AuthorizeResult } from '@backstage/plugin-permission-common';

import { Adapter, Model } from 'casbin';
import express from 'express';
import request from 'supertest';

import { permissionEntityReadPermission } from '../permissions';
import { PolicyBuilder } from './policy-builder';

jest.mock('@backstage/plugin-auth-node', () => ({
  getBearerTokenFromAuthorizationHeader: () => 'token',
}));

describe('PolicyBuilder', () => {
  let app: express.Express;

  const mockedAuthorize = jest.fn().mockImplementation(async () => [
    {
      result: AuthorizeResult.ALLOW,
    },
  ]);

  const mockedAuthorizeConditional = jest.fn().mockImplementation(async () => [
    {
      result: AuthorizeResult.ALLOW,
    },
  ]);

  const mockPermissionEvaluator = {
    authorize: mockedAuthorize,
    authorizeConditional: mockedAuthorizeConditional,
  };

  const mockUser = {
    type: 'User',
    userEntityRef: 'user:default/guest',
    ownershipEntityRefs: ['guest'],
  };

  const mockIdentityClient = {
    getIdentity: jest.fn().mockImplementation(async () => ({
      identity: mockUser,
    })),
  };

  const mockAdapter = {
    loadPolicy: jest
      .fn()
      .mockImplementation(async (_model: Model): Promise<void> => {}),
    savePolicy: jest
      .fn()
      .mockImplementation(async (_model: Model): Promise<boolean> => {
        return true;
      }),
    addPolicy: jest
      .fn()
      .mockImplementation(
        async (
          _sec: string,
          _ptype: string,
          _rule: string[],
        ): Promise<void> => {},
      ),
    removePolicy: jest
      .fn()
      .mockImplementation(
        async (
          _sec: string,
          _ptype: string,
          _rule: string[],
        ): Promise<void> => {},
      ),
    removeFilteredPolicy: jest
      .fn()
      .mockImplementation(
        async (
          _sec: string,
          _ptype: string,
          _fieldIndex: number,
          ..._fieldValues: string[]
        ) => {},
      ),
  };

  const mockAdapterFactory = {
    createAdapter: jest.fn().mockImplementation(async (): Promise<Adapter> => {
      return mockAdapter;
    }),
  };

  beforeEach(async () => {
    const router = await PolicyBuilder.build({
      config: new ConfigReader({
        permission: {
          enabled: true,
        },
      }),
      logger: getVoidLogger(),
      discovery: {
        getBaseUrl: jest.fn(),
        getExternalBaseUrl: jest.fn(),
      },
      identity: mockIdentityClient,
      permissions: mockPermissionEvaluator,
      adapterFactory: mockAdapterFactory,
    });
    app = express().use(router);
    jest.clearAllMocks();
  });

  it('should build', () => {
    expect(app).toBeTruthy();
  });

  describe('GET /', () => {
    it('should return a status of Authorized', async () => {
      const result = await request(app).get('/').send();

      expect(result.status).toBe(200);
      expect(result.body).toEqual({ status: 'Authorized' });
    });

    it('should return a status of Unauthorized', async () => {
      mockedAuthorizeConditional.mockImplementationOnce(async () => [
        { result: AuthorizeResult.DENY },
      ]);
      const result = await request(app).get('/').send();

      expect(mockedAuthorizeConditional).toHaveBeenCalledWith(
        [{ permission: permissionEntityReadPermission }],
        { token: 'token' },
      );
      expect(result.status).toBe(403);
      expect(result.body).toEqual({ status: 'Unauthorized' });
    });
  });
});
