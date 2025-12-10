import { component, field } from '@lastolivegames/becsy';

@component
export class ColumnLayout {
    /**
     * Whether the entity acts as a column that automatically stacks its children.
     */
    @field.boolean declare isAutoLayout: boolean;

    /**
     * Layout direction.
     * 'vertical' | 'horizontal'
     * Default: 'vertical'
     */
    @field.staticString(['vertical', 'horizontal']) declare direction: 'vertical' | 'horizontal';

    /**
     * Gap between children in pixels.
     * Default: 10
     */
    @field.float32 declare gap: number;

    /**
     * Internal padding of the column container.
     * Default: 10
     */
    @field.float32 declare padding: number;

    /**
     * How to align children along the cross axis.
     * For vertical layout: horizontal alignment
     * For horizontal layout: vertical alignment
     * 'start' | 'center' | 'end' | 'stretch'
     */
    @field.staticString(['start', 'center', 'end', 'stretch']) declare alignItems: 'start' | 'center' | 'end' | 'stretch';

    /**
     * Maximum number of children allowed in this column.
     * 0 means unlimited.
     * Default: 0
     */
    @field.uint32 declare maxChildren: number;

    /**
     * Whether to show the drop zone indicator during drag-and-drop.
     * Used for visual feedback when dragging cards over columns.
     * Default: false
     */
    @field.boolean declare showDropZone: boolean;

    constructor(props?: Partial<ColumnLayout>) {
        this.isAutoLayout = props?.isAutoLayout ?? true;
        this.direction = props?.direction ?? 'vertical';
        this.gap = props?.gap ?? 10;
        this.padding = props?.padding ?? 10;
        this.alignItems = props?.alignItems ?? 'stretch';
        this.maxChildren = props?.maxChildren ?? 0;
        this.showDropZone = props?.showDropZone ?? false;
    }
}
