import { System } from '@lastolivegames/becsy';
import { ColumnLayout } from '../components';
import { Parent } from '../components';
import { Transform } from '../components';
import { Rect } from '../components';

/**
 * ColumnLayoutSystem manages auto-layout for column containers.
 *
 * **Stage:** Update (runs after InputSystem, before RenderSystem)
 *
 * **Dependencies:**
 * - Requires ColumnLayout, Parent, Transform, Rect components
 * - Must run before HtmlOverlaySystem for correct positioning
 *
 * **Features:**
 * - Vertical and horizontal layout directions
 * - Configurable gap and padding
 * - Cross-axis alignment (start, center, end, stretch)
 * - Auto-resize container to fit children
 *
 * **Performance:**
 * - O(n) where n = number of children per column
 * - Optimized to avoid unnecessary writes (threshold check)
 */
export class ColumnLayoutSystem extends System {
    columns = this.query((q) => q.current.with(ColumnLayout, Parent, Rect).write);

    execute() {
        this.columns.current.forEach((entity) => {
            const layout = entity.read(ColumnLayout);
            if (!layout.isAutoLayout) return;

            const parentComp = entity.read(Parent);
            const children = parentComp.children;
            if (!children || children.length === 0) return;

            // Respect maxChildren limit (0 = unlimited)
            const effectiveChildren = layout.maxChildren > 0
                ? children.slice(0, layout.maxChildren)
                : children;

            const parentRect = entity.read(Rect);
            const isVertical = layout.direction === 'vertical';

            // For alignment calculations, we need container dimensions
            const containerWidth = parentRect.width;
            const containerHeight = parentRect.height;

            let currentPos = layout.padding; // Current position along main axis
            let maxCrossSize = 0; // Maximum size along cross axis

            for (const child of effectiveChildren) {
                if (!child.alive || !child.has(Transform) || !child.has(Rect)) continue;

                const childTransform = child.read(Transform);
                const childRect = child.read(Rect);

                let desiredX: number;
                let desiredY: number;

                if (isVertical) {
                    // Vertical layout: stack along Y axis, align along X axis
                    desiredY = currentPos;
                    desiredX = this.calculateCrossAxisPosition(
                        layout.alignItems,
                        layout.padding,
                        containerWidth,
                        childRect.width
                    );

                    // Handle stretch: resize child width to fill container
                    if (layout.alignItems === 'stretch') {
                        const stretchedWidth = containerWidth - layout.padding * 2;
                        if (Math.abs(childRect.width - stretchedWidth) > 0.01) {
                            child.write(Rect).width = stretchedWidth;
                        }
                    }

                    currentPos += childRect.height + layout.gap;
                    maxCrossSize = Math.max(maxCrossSize, childRect.width);
                } else {
                    // Horizontal layout: stack along X axis, align along Y axis
                    desiredX = currentPos;
                    desiredY = this.calculateCrossAxisPosition(
                        layout.alignItems,
                        layout.padding,
                        containerHeight,
                        childRect.height
                    );

                    // Handle stretch: resize child height to fill container
                    if (layout.alignItems === 'stretch') {
                        const stretchedHeight = containerHeight - layout.padding * 2;
                        if (Math.abs(childRect.height - stretchedHeight) > 0.01) {
                            child.write(Rect).height = stretchedHeight;
                        }
                    }

                    currentPos += childRect.width + layout.gap;
                    maxCrossSize = Math.max(maxCrossSize, childRect.height);
                }

                // Check if update needed to avoid thrashing
                if (
                    Math.abs(childTransform.translation.y - desiredY) > 0.01 ||
                    Math.abs(childTransform.translation.x - desiredX) > 0.01
                ) {
                    child.write(Transform).translation.y = desiredY;
                    child.write(Transform).translation.x = desiredX;
                }
            }

            // Update parent size to fit all children
            // finalMainSize = currentPos - gap + padding (remove last gap, add end padding)
            const finalMainSize = currentPos - layout.gap + layout.padding;

            if (isVertical) {
                if (Math.abs(parentRect.height - finalMainSize) > 0.01) {
                    entity.write(Rect).height = finalMainSize;
                }
            } else {
                if (Math.abs(parentRect.width - finalMainSize) > 0.01) {
                    entity.write(Rect).width = finalMainSize;
                }
            }
        });
    }

    /**
     * Calculate position along the cross axis based on alignment.
     * @param alignItems - Alignment mode
     * @param padding - Container padding
     * @param containerSize - Size of container along cross axis
     * @param childSize - Size of child along cross axis
     * @returns Position for the child along cross axis
     */
    private calculateCrossAxisPosition(
        alignItems: 'start' | 'center' | 'end' | 'stretch',
        padding: number,
        containerSize: number,
        childSize: number
    ): number {
        switch (alignItems) {
            case 'start':
            case 'stretch': // Stretch uses start position, but resizes the child
                return padding;
            case 'center':
                return (containerSize - childSize) / 2;
            case 'end':
                return containerSize - padding - childSize;
            default:
                return padding;
        }
    }
}
