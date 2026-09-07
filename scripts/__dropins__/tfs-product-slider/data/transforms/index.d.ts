import { ProductSliderItem, ProductSliderResult } from '../models';

type MoneyAmount = {
    amount?: {
        value?: number | null;
        currency?: string | null;
    } | null;
};
type PricePair = {
    regular?: MoneyAmount | null;
    final?: MoneyAmount | null;
};
/** Raw productView shape from Catalog Service productSearch */
export interface RawProductView {
    sku?: string | null;
    name?: string | null;
    url?: string | null;
    urlKey?: string | null;
    inStock?: boolean | null;
    addToCartAllowed?: boolean | null;
    images?: Array<{
        url?: string | null;
        label?: string | null;
        roles?: string[] | null;
    }> | null;
    attributes?: Array<{
        name?: string | null;
        label?: string | null;
        value?: string | null;
        roles?: string[] | null;
    }> | null;
    /** SimpleProductView */
    price?: PricePair | null;
    /** ComplexProductView */
    priceRange?: {
        minimum?: PricePair | null;
        maximum?: PricePair | null;
    } | null;
}
export interface RawProductSearchItem {
    productView?: RawProductView | null;
}
export interface RawProductSearchResponse {
    productSearch?: {
        total_count?: number | null;
        items?: Array<RawProductSearchItem | null> | null;
    } | null;
}
/**
 * Map a Catalog Service productView into a slider product item.
 * Supports SimpleProductView.price and ComplexProductView.priceRange.
 */
export declare function transformProductView(view: RawProductView | null | undefined): ProductSliderItem | null;
/**
 * Transform productSearch GraphQL response into drop-in model.
 */
export declare function transformProductSearch(data: RawProductSearchResponse | null | undefined): ProductSliderResult;
export {};
//# sourceMappingURL=index.d.ts.map