import { HTMLAttributes } from 'preact/compat';
import { Container } from '@dropins/tools/types/elsie/src/lib';
import { CategoryItem } from '../../api/menu';

export interface MenuContainerProps extends HTMLAttributes<HTMLDivElement> {
    parentId?: string;
    fetchCategories?: () => Promise<CategoryItem[]>;
}
export declare const MenuContainer: Container<MenuContainerProps>;
//# sourceMappingURL=MenuContainer.d.ts.map