import { FunctionComponent } from 'preact';
import { HTMLAttributes } from 'preact/compat';
import { ProductSliderItem } from '../../data/models';
import { ProductClickTarget } from '../ProductCard';

export interface ProductSliderComponentProps extends HTMLAttributes<HTMLDivElement> {
    title?: string;
    products?: ProductSliderItem[];
    loading?: boolean;
    errorMessage?: string | null;
    emptyMessage?: string;
    previousLabel?: string;
    nextLabel?: string;
    fromLabel?: string;
    saveLabel?: string;
    reviewsLabel?: string;
    reviewLabel?: string;
    addToCartLabel?: string;
    addToWishlistLabel?: string;
    skeletonCount?: number;
    onProductClick?: (product: ProductSliderItem, target: ProductClickTarget) => void;
    onProductImageClick?: (product: ProductSliderItem) => void;
    onProductNameClick?: (product: ProductSliderItem) => void;
    /** UI hook only — storefront wires cart `addProductsToCart`. */
    onAddToCart?: (product: ProductSliderItem) => void;
    /** UI hook only — storefront wires wishlist mutation. */
    onAddToWishlist?: (product: ProductSliderItem) => void;
}
export declare const ProductSliderComponent: FunctionComponent<ProductSliderComponentProps>;
//# sourceMappingURL=ProductSliderComponent.d.ts.map