export type Losses = ReturnType<typeof expandLosses>;
export function expandLosses(data: number[]) {
  const [
    infantryBattle,
    infantryAttrition,
    _u1,
    cavalryBattle,
    cavalryAttrition,
    _u2,
    artilleryBattle,
    artilleryAttrition,
    _u3,
    heavyShipBattle,
    heavyShipAttrition,
    heavyShipCapture,
    lightShipBattle,
    lightShipAttrition,
    lightShipCapture,
    galleyShipBattle,
    galleyShipAttrition,
    galleyShipCapture,
    transportShipBattle,
    transportShipAttrition,
    transportShipCapture,
  ] = data;
  const landTotalBattle = infantryBattle + cavalryBattle + artilleryBattle;
  const landTotalAttrition =
    infantryAttrition + cavalryAttrition + artilleryAttrition;
  const landTotal = landTotalBattle + landTotalAttrition;

  const navyTotalBattle =
    heavyShipBattle + lightShipBattle + galleyShipBattle + lightShipBattle;
  const navyTotalCapture =
    heavyShipCapture + lightShipCapture + galleyShipCapture + lightShipCapture;
  const navyTotalAttrition =
    heavyShipAttrition +
    lightShipAttrition +
    galleyShipAttrition +
    lightShipAttrition;
  const navyTotal = navyTotalBattle + navyTotalCapture + navyTotalAttrition;
  const total = navyTotal + landTotal;
  const totalBattle = landTotalBattle + navyTotalBattle;
  const totalAttrition = navyTotalAttrition + landTotalAttrition;
  return {
    totalBattle,
    totalAttrition,
    landTotalBattle,
    landTotalAttrition,
    landTotal,
    navyTotalBattle,
    navyTotalAttrition,
    navyTotalCapture,
    navyTotal,
    infantryBattle,
    infantryAttrition,
    cavalryBattle,
    cavalryAttrition,
    artilleryBattle,
    artilleryAttrition,
    heavyShipBattle,
    heavyShipAttrition,
    heavyShipCapture,
    lightShipBattle,
    lightShipAttrition,
    lightShipCapture,
    galleyShipBattle,
    galleyShipAttrition,
    galleyShipCapture,
    transportShipBattle,
    transportShipAttrition,
    transportShipCapture,
    total,
  };
}
