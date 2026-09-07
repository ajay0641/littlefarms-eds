/*! Copyright 2026 Adobe
All Rights Reserved. */
import{Initializer as i}from"@dropins/tools/lib.js";import{s,b as n}from"./fetch-graphql.js";const o=new i({init:async t=>{const e={...{storeViewCode:"default",websiteCode:"base",storeCode:"main_website_store"},...t};e.endpoint&&s(e.endpoint),n({"Magento-Store-View-Code":e.storeViewCode??"default","Magento-Website-Code":e.websiteCode??"base","Magento-Store-Code":e.storeCode??"main_website_store"}),o.config.setConfig(e)},listeners:()=>[]}),f=o.config;export{f as c,o as i};
//# sourceMappingURL=initialize.js.map
