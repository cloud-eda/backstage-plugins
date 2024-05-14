import { createBackend } from '@backstage/backend-defaults';
import { createBackendModule } from '@backstage/backend-plugin-api';
import { githubAuthenticator } from '@backstage/plugin-auth-backend-module-github-provider';
import {
  authProvidersExtensionPoint,
  createOAuthProviderFactory,
} from '@backstage/plugin-auth-node';

const backend = createBackend();

backend.add(import('@backstage/plugin-app-backend/alpha'));
backend.add(import('@backstage/plugin-proxy-backend/alpha'));
backend.add(import('@backstage/plugin-scaffolder-backend/alpha'));
backend.add(import('@backstage/plugin-techdocs-backend/alpha'));

// auth plugin
backend.add(import('@backstage/plugin-auth-backend'));
// See https://backstage.io/docs/backend-system/building-backends/migrating#the-auth-plugin
backend.add(import('@backstage/plugin-auth-backend-module-guest-provider'));
// See https://backstage.io/docs/auth/guest/provider

// catalog plugin
backend.add(import('@backstage/plugin-catalog-backend/alpha'));
backend.add(
  import('@backstage/plugin-catalog-backend-module-scaffolder-entity-model'),
);

// permission plugin
backend.add(import('@janus-idp/backstage-plugin-rbac-backend'));

backend.add(import('@backstage/plugin-auth-backend-module-github-provider'));

// const customAuth = createBackendModule({
//   // This ID must be exactly "auth" because that's the plugin it targets
//   pluginId: 'auth',
//   // This ID must be unique, but can be anything
//   moduleId: 'custom-auth-provider',
//   register(reg) {
//     reg.registerInit({
//       deps: { providers: authProvidersExtensionPoint },
//       async init({ providers }) {
//         providers.registerProvider({
//           // This ID must match the actual provider config, e.g. addressing
//           // auth.providers.github means that this must be "github".
//           providerId: 'github',
//           // Use createProxyAuthProviderFactory instead if it's one of the proxy
//           // based providers rather than an OAuth based one
//           factory: createOAuthProviderFactory({
//             authenticator: githubAuthenticator,
//             async signInResolver(info, ctx) {
//               console.log(info.result.fullProfile.username, "###user");
//               const userRef = `user:default/${info.result.fullProfile.username?.toLowerCase()}`;
//               console.log(userRef, "###userRef");
//               return ctx.issueToken({
//                 claims: {
//                   sub: userRef, // The user's own identity
//                   ent: [userRef], // A list of identities that the user claims ownership through
//                 },
//               });
//             },
//           }),
//         });
//       },
//     });
//   },
// });
// backend.add(customAuth);
backend.add(import('@backstage/plugin-auth-backend-module-bitbucket-provider'));
backend.add(import('@backstage/plugin-auth-backend-module-microsoft-provider'));

// search plugin
backend.add(import('@backstage/plugin-search-backend/alpha'));
backend.add(import('@backstage/plugin-search-backend-module-catalog/alpha'));
backend.add(import('@backstage/plugin-search-backend-module-techdocs/alpha'));

backend.start();
