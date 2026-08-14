import type { FeatureComponentIndex } from "@typings/feature";
import partnerAddModal from "./components/add-modal";
import partnerRemoveModal from "./components/remove-modal";
import partnerAnnounceModal from "./components/announce-modal";
import { partnerExploreSelect, partnerExploreBack } from "./components/explore";

export default {
    feature: "partner",
    handlers: [partnerAddModal, partnerRemoveModal, partnerAnnounceModal, partnerExploreSelect, partnerExploreBack],
} satisfies FeatureComponentIndex;
