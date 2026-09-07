/********************************************************************
 *  Copyright 2025 Adobe
 *  All Rights Reserved.
 *
 * NOTICE:  Adobe permits you to use, copy, and distribute this
 * file in accordance with the terms of the Adobe license agreement
 * accompanying it.
 *******************************************************************/
/** A product card shown in the slider. */
export interface ProductSliderItem {
    sku: string;
    name: string;
    /** Optional secondary line (attribute / brand line). */
    subtitle?: string;
    url: string;
    urlKey?: string;
    imageUrl?: string;
    imageLabel?: string;
    /** Final / sale price (simple) or minimum final (complex) */
    finalPrice?: number;
    /** Regular price (simple) or minimum regular (complex) */
    regularPrice?: number;
    currency?: string;
    /** Upper bound for complex products (price range) */
    maxFinalPrice?: number;
    maxRegularPrice?: number;
    /** True when product uses a price range (configurable / complex). */
    isPriceRange?: boolean;
    /** Computed discount percent when regular > final */
    savePercent?: number;
    inStock?: boolean;
    addToCartAllowed?: boolean;
    /** Average rating out of 5, when available */
    rating?: number;
    /** Number of customer reviews */
    reviewCount?: number;
}
export interface ProductSliderResult {
    totalCount: number;
    items: ProductSliderItem[];
}
/** productSearch filter clause */
export interface ProductSearchFilter {
    attribute: string;
    eq?: string;
    in?: string[];
    range?: {
        from?: number;
        to?: number;
    };
}
export interface GetProductSliderOptions {
    phrase?: string;
    pageSize?: number;
    currentPage?: number;
    filter?: ProductSearchFilter[];
}
//# sourceMappingURL=index.d.ts.map