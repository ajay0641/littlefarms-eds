import { FunctionComponent } from 'preact';
import { HTMLAttributes } from 'preact/compat';
import { CategoryItem } from '../../api/menu';

export interface MenuComponentProps extends HTMLAttributes<HTMLDivElement> {
    parentId?: string;
    /** Optional custom fetch for Storybook, tests, or alternate data sources. */
    fetchCategories?: () => Promise<CategoryItem[]>;
}
export interface CategoryTreeItem extends CategoryItem {
    childCategories?: CategoryTreeItem[];
}
export declare const buildCategoryTree: (items: CategoryItem[], rootId: string) => CategoryTreeItem[];
export declare const MenuComponent: FunctionComponent<MenuComponentProps>;
//# sourceMappingURL=MenuComponent.d.ts.map