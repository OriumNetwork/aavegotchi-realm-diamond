// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "forge-std/Test.sol";
import {InstallationFacet} from "@installation/facets/InstallationFacet.sol";
import {RealmFacet} from "@realm/facets/RealmFacet.sol";
import {TestConstants as C} from "@test/constants.t.sol";
import {IDiamondCut} from "@interfaces/IDiamondCut.sol";
import {console2} from "forge-std/console2.sol";
import {TestUpgrades} from "@test/upgrade.t.sol";

contract TestFoundryDiamond is Test, TestUpgrades {
  InstallationFacet installationFacet;
  RealmFacet realmFacet;

  function setUp() public {
    deployFacets();
    cutInstallation();
    cutRealm();
    installationFacet = InstallationFacet(C.INSTALLATION_DIAMOND_ADDRESS_MATIC);
    realmFacet = RealmFacet(C.REALM_DIAMOND_ADDRESS_MATIC);
  }

  function deployFacets() internal {
    console2.log("Deploying facets");
    installationFacet = new InstallationFacet();
    console2.log("New installation facet:");
    console2.log(address(installationFacet));
    realmFacet = new RealmFacet();
    console2.log("New realm facet:");
    console2.log(address(realmFacet));
  }

  function cutInstallation() internal {
    console2.log("Cutting Installation Diamond");
    IDiamondCut.FacetCut[] memory installationCuts = new IDiamondCut.FacetCut[](1);
    installationCuts[0] = getReplaceFacetSelectorCutFromExistingSelector(
      C.INSTALLATION_DIAMOND_ADDRESS_MATIC,
      address(installationFacet),
      InstallationFacet.getInstallationType.selector
    );
    logFunctionSelectors(installationCuts);

    vm.prank(getDiamondOwner(C.INSTALLATION_DIAMOND_ADDRESS_MATIC));
    IDiamondCut(C.INSTALLATION_DIAMOND_ADDRESS_MATIC).diamondCut(installationCuts, address(0), "");
  }

  function cutRealm() internal {
    console2.log("Cutting Realm Diamond");
    IDiamondCut.FacetCut[] memory realmCuts = new IDiamondCut.FacetCut[](1);
    realmCuts[0] = getReplaceFacetSelectorCutFromExistingSelector(
      C.REALM_DIAMOND_ADDRESS_MATIC,
      address(realmFacet),
      RealmFacet.equipInstallation.selector
    );
    logFunctionSelectors(realmCuts);

    vm.prank(getDiamondOwner(C.REALM_DIAMOND_ADDRESS_MATIC));
    IDiamondCut(C.REALM_DIAMOND_ADDRESS_MATIC).diamondCut(realmCuts, address(0), "");
  }

  function test1() public {
    console2.log(installationFacet.getAltarLevel(12));
  }
}
