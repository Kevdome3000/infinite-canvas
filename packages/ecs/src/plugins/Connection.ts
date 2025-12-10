import { component, system } from '@lastolivegames/becsy';
import { Plugin } from './types';
import { Connection } from '../components';
import { ConnectionRoutingSystem } from '../systems/ConnectionRoutingSystem';
import { Update } from '../systems';

/**
 * ConnectionPlugin registers the Connection component and ConnectionRoutingSystem.
 *
 * **Provides:**
 * - Connection component for linking entities
 * - ConnectionRoutingSystem for calculating connection paths
 *
 * **Dependencies:**
 * - Requires TransformPlugin (for GlobalTransform)
 * - Should be registered after core plugins
 *
 * **Usage:**
 * ```typescript
 * const app = new App()
 *   .addPlugins(DefaultPlugins, ConnectionPlugin)
 *   .run();
 * ```
 */
export const ConnectionPlugin: Plugin = () => {
    component(Connection);
    system(Update)(ConnectionRoutingSystem);
};
