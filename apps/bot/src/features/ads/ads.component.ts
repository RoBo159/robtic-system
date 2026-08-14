import type { FeatureComponentIndex } from "@typings/feature";
import addonsView from "./components/addons-view";
import cartAdd from "./components/cart-add";
import cartClear from "./components/cart-clear";
import cartConfirm from "./components/cart-confirm";
import cartRemove from "./components/cart-remove";
import cartView from "./components/cart-view";
import configButtons from "./components/config-buttons";
import configModals from "./components/config-modals";
import configSelect from "./components/config-select";
import orderDecision from "./components/order-decision";
import adsPackage from "./components/package";
import rules from "./components/rules";
import selectAddon from "./components/select-addon";
import ticketClaim from "./components/ticket-claim";
import ticketClose from "./components/ticket-close";

export default {
    feature: "ads",
    handlers: [
        addonsView,
        cartAdd,
        cartClear,
        cartConfirm,
        cartRemove,
        cartView,
        configButtons,
        configModals,
        configSelect,
        orderDecision,
        adsPackage,
        rules,
        selectAddon,
        ticketClaim,
        ticketClose,
    ],
} satisfies FeatureComponentIndex;
