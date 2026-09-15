/********************************************************************
 *  Copyright 2025 Adobe
 *  All Rights Reserved.
 *
 * NOTICE:  Adobe permits you to use, modify, and distribute this
 * file in accordance with the terms of the Adobe license agreement
 * accompanying it.
 *******************************************************************/
export declare const GET_CATEGORIES_QUERY = "\n  query GetCategories(\n    $ids: [String!]!\n    $roles: [String!]!\n    $depth: Int!\n    $startLevel: Int!\n  ) {\n    categories(\n      ids: $ids\n      roles: $roles\n      subtree: {\n        depth: $depth\n        startLevel: $startLevel\n      }\n    ) {\n      id\n      name\n      level\n      urlPath\n      urlKey\n      parentId\n      children\n    }\n  }\n";
export interface CategoryItem {
    id: string;
    name: string;
    level: number;
    urlPath: string;
    urlKey: string;
    parentId: string;
    children?: string[] | null;
}
export interface GetCategoriesResponse {
    categories: CategoryItem[];
}
export declare const getMenu: (parentId?: string) => Promise<CategoryItem[]>;
export declare const menu: (parentId?: string) => Promise<CategoryItem[]>;
//# sourceMappingURL=menu.d.ts.map