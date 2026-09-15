/*! Copyright 2026 Adobe
All Rights Reserved. */
import{FetchGraphQL as a}from"@dropins/tools/fetch-graphql.js";const{setEndpoint:h,setFetchGraphQlHeader:t,removeFetchGraphQlHeader:l,setFetchGraphQlHeaders:c,fetchGraphQl:o,getConfig:g}=new a().getMethods(),n=`
  query GetCategories(
    $ids: [String!]!
    $roles: [String!]!
    $depth: Int!
    $startLevel: Int!
  ) {
    categories(
      ids: $ids
      roles: $roles
      subtree: {
        depth: $depth
        startLevel: $startLevel
      }
    ) {
      id
      name
      level
      urlPath
      urlKey
      parentId
      children
    }
  }
`,i=async(r="2")=>{t("Magento-Store-View-Code","default"),t("Magento-Website-Code","base");const{data:s,errors:e}=await o(n,{variables:{ids:[r],roles:["show_in_menu","active"],depth:3,startLevel:1}});if(e)throw new Error(e[0].message);return s.categories},p=i;export{t as a,c as b,g as c,o as f,i as g,p as m,l as r,h as s};
//# sourceMappingURL=menu.js.map
