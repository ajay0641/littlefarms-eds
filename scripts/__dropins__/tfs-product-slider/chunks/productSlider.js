/*! Copyright 2026 Adobe
All Rights Reserved. */
import{f as p}from"./fetch-graphql.js";function S(n){return n.replace(/<[^>]*>/g,"").trim()}function f(n,r){if(!(n!=null&&n.length))return;const o=r.map(t=>t.toLowerCase()),e=n.find(t=>(t==null?void 0:t.name)&&o.includes(t.name.toLowerCase()));return(e==null?void 0:e.value)??void 0}function b(n){if(n==null||n==="")return;const r=Number(n);return Number.isFinite(r)?r:void 0}function P(n){if(!(n!=null&&n.length))return;const r=["image","small_image","thumbnail"];for(const e of r){const t=n.find(l=>{var u;return(u=l==null?void 0:l.roles)==null?void 0:u.some(c=>(c==null?void 0:c.toLowerCase())===e)});if(t!=null&&t.url)return{url:t.url,label:t.label??void 0}}const o=n.find(e=>e==null?void 0:e.url);return o?{url:o.url??void 0,label:o.label??void 0}:void 0}function m(n){var t,l,u,c,s,a,i,d;const r=((l=(t=n==null?void 0:n.final)==null?void 0:t.amount)==null?void 0:l.value)??void 0,o=((c=(u=n==null?void 0:n.regular)==null?void 0:u.amount)==null?void 0:c.value)??void 0,e=((a=(s=n==null?void 0:n.final)==null?void 0:s.amount)==null?void 0:a.currency)??((d=(i=n==null?void 0:n.regular)==null?void 0:i.amount)==null?void 0:d.currency)??void 0;return{finalPrice:r,regularPrice:o,currency:e}}function h(n,r){if(typeof n=="number"&&typeof r=="number"&&r>n&&r>0)return Math.round((r-n)/r*100)}function C(n){return n.url?n.url:n.urlKey?`/${n.urlKey}`:"#"}function R(n){const r=f(n.attributes,["short_description","subtitle","brand","manufacturer"]);if(r)return S(r)}function _(n){var g,y;if(!(n!=null&&n.sku)||!(n!=null&&n.name))return null;const r=P(n.images),o=!!n.priceRange,e=m(o?(g=n.priceRange)==null?void 0:g.minimum:n.price),t=o?m((y=n.priceRange)==null?void 0:y.maximum):{},l=e.finalPrice,u=e.regularPrice,c=e.currency??t.currency,s=h(l,u),a=b(f(n.attributes,["rating_summary","rating"]))??void 0,i=a!=null?a>5?Math.min(5,a/20):a:void 0,d=b(f(n.attributes,["review_count","reviews_count"]));return{sku:n.sku,name:n.name,subtitle:R(n),url:C(n),urlKey:n.urlKey??void 0,imageUrl:r==null?void 0:r.url,imageLabel:(r==null?void 0:r.label)||n.name,finalPrice:l,regularPrice:u,currency:c,maxFinalPrice:t.finalPrice,maxRegularPrice:t.regularPrice,isPriceRange:o,savePercent:s,inStock:n.inStock??void 0,addToCartAllowed:n.addToCartAllowed??void 0,rating:i,reviewCount:d}}function x(n){const r=n==null?void 0:n.productSearch,o=((r==null?void 0:r.items)??[]).map(e=>_(e==null?void 0:e.productView)).filter(e=>e!=null);return{totalCount:(r==null?void 0:r.total_count)??o.length,items:o}}const $=[{attribute:"isNew",eq:"1"}],k=`
  query ProductSlider(
    $phrase: String!
    $pageSize: Int!
    $currentPage: Int!
    $filter: [SearchClauseInput!]
  ) {
    productSearch(
      phrase: $phrase
      page_size: $pageSize
      current_page: $currentPage
      filter: $filter
    ) {
      total_count
      items {
        productView {
          sku
          name
          url
          urlKey
          inStock
          addToCartAllowed
          images {
            url
            label
            roles
          }
          attributes {
            name
            label
            value
            roles
          }
          ... on SimpleProductView {
            price {
              regular {
                amount {
                  value
                  currency
                }
              }
              final {
                amount {
                  value
                  currency
                }
              }
            }
          }
          ... on ComplexProductView {
            priceRange {
              minimum {
                regular {
                  amount {
                    value
                    currency
                  }
                }
                final {
                  amount {
                    value
                    currency
                  }
                }
              }
              maximum {
                regular {
                  amount {
                    value
                    currency
                  }
                }
                final {
                  amount {
                    value
                    currency
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`,v=async(n={})=>{const{phrase:r="",pageSize:o=8,currentPage:e=1,filter:t=$}=n,{data:l,errors:u}=await p(k,{variables:{phrase:r,pageSize:o,currentPage:e,filter:t}});if(u!=null&&u.length)throw new Error(u.map(c=>c.message).join(", "));return x(l)},A=v;export{v as g,A as p};
//# sourceMappingURL=productSlider.js.map
