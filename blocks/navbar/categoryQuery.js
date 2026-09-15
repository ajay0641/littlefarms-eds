export const CATEGORY_TREE_QUERY = `
  query CategoryNavigation($rootCategoryIds: [String!]!) {
    categories(
      ids: $rootCategoryIds,
      roles: ["show_in_menu", "active"],
      subtree: { startLevel: 2, depth: 3 }
    ) {
      name
      position
      id
      urlPath
      parentId
    }
  }
`;
