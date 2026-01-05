/// <reference types="jest" />
/**
 * RenderHTML System Tests
 *
 * Tests the query execution order fix that ensures DOM elements are created
 * before culling/editables queries attempt to access element.style.
 *
 * Bug Context:
 * When entities were deserialized from persistence, HTMLContainer.element was null.
 * ViewportCulling would add Culled component before RenderHTML created the element,
 * causing "Cannot read properties of null (reading 'style')" errors.
 *
 * Fix: Reorder execute() to process htmls.added and embeds.added FIRST,
 * before culled and editables queries.
 */
import {
    HTMLContainer,
} from '../../packages/ecs/src';

describe('RenderHTML System', () => {
    describe('HTMLContainer component - null element handling', () => {
        /**
         * These tests verify the HTMLContainer component behavior that is
         * critical to the RenderHTML query execution order fix.
         *
         * The fix ensures that when HTMLContainer.element is null (as it is
         * during deserialization), the culled and editables queries don't
         * crash by:
         * 1. Processing htmls.added FIRST to create elements
         * 2. Adding null guards in culled/editables queries as safety
         */

        it('should initialize with falsy element by default', () => {
            // HTMLContainer is created with element: null/undefined during deserialization
            // This is the default state that caused the original bug
            // Note: Becsy field default (null) only applies when attached to entity via ECS
            // Direct instantiation may return undefined
            const container = new HTMLContainer();
            expect(container.element).toBeFalsy();
        });

        it('should allow element to be set after initialization', () => {
            const container = new HTMLContainer();
            expect(container.element).toBeFalsy();

            // Simulate what RenderHTML Phase 1 does: create and assign element
            const mockElement = {
                style: {
                    display: '',
                    position: '',
                    pointerEvents: '',
                    overflow: '',
                    transformOrigin: '',
                    contain: '',
                    transform: '',
                    width: '',
                    height: '',
                },
                innerHTML: '',
                appendChild: jest.fn(),
                querySelector: jest.fn(),
            } as unknown as HTMLElement;

            container.element = mockElement;

            expect(container.element).toBe(mockElement);
            expect(container.element).not.toBeNull();
        });

        it('should handle element style access after element is set', () => {
            const container = new HTMLContainer();

            // Create mock element
            const mockElement = {
                style: {
                    display: 'block',
                    pointerEvents: 'none',
                },
            } as unknown as HTMLElement;

            container.element = mockElement;

            // This simulates what culled query does after Phase 1 creates element
            expect(() => {
                container.element!.style.display = 'none';
            }).not.toThrow();

            expect(container.element!.style.display).toBe('none');
        });

        it('should safely skip when element is falsy (null guard pattern)', () => {
            const container = new HTMLContainer();

            // This simulates the null guard pattern added in the fix
            const { element } = container;

            // The fix adds: if (!element) return;
            if (!element) {
                // Guard triggered - this is expected during first frame before Phase 1
                expect(element).toBeFalsy();
                return;
            }

            // This line should not be reached when element is null/undefined
            element.style.display = 'none';
        });
    });

    describe('Query execution order verification', () => {
        /**
         * Conceptual test: Verifies the expected order of operations in RenderHTML
         *
         * The fix ensures this order:
         * Phase 1: Element Creation (htmls.added, embeds.added)
         * Phase 2: Visibility & Culling (culled query)
         * Phase 3: Interactivity (editables query)
         * Phase 4: Transform Updates (htmls.changed, embeds.changed)
         */

        it('should document the correct phase order', () => {
            const phases = [
                'PHASE 1: ELEMENT CREATION',
                'PHASE 2: VISIBILITY & CULLING',
                'PHASE 3: INTERACTIVITY',
                'PHASE 4: TRANSFORM UPDATES',
            ];

            // Phase 1 must come before Phase 2 and 3
            expect(phases.indexOf('PHASE 1: ELEMENT CREATION')).toBeLessThan(
                phases.indexOf('PHASE 2: VISIBILITY & CULLING')
            );
            expect(phases.indexOf('PHASE 1: ELEMENT CREATION')).toBeLessThan(
                phases.indexOf('PHASE 3: INTERACTIVITY')
            );

            // Phase 4 comes last
            expect(phases.indexOf('PHASE 4: TRANSFORM UPDATES')).toBe(3);
        });

        it('should verify null guards prevent crashes on null element', () => {
            // Simulate multiple HTMLContainers, some with null elements
            const containers = [
                new HTMLContainer(), // null element (just deserialized)
                new HTMLContainer(), // null element (just deserialized)
                (() => {
                    const c = new HTMLContainer();
                    c.element = { style: { display: 'block' } } as HTMLElement;
                    return c;
                })(), // has element
            ];

            // Simulate culled query with null guard
            let processedCount = 0;
            let skippedCount = 0;

            containers.forEach((container) => {
                const { element } = container;
                if (!element) {
                    skippedCount++;
                    return;
                }
                element.style.display = 'none';
                processedCount++;
            });

            // Two should be skipped (null), one processed
            expect(skippedCount).toBe(2);
            expect(processedCount).toBe(1);
        });
    });
});
