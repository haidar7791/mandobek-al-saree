import { doc, runTransaction } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  applyFarmActionToState,
  createInitialFarmSave,
  normalizeFarm,
  type FarmAction,
  type FarmGameSave,
} from "@/lib/farm-game";

export async function loadFarmGame(playerId: string): Promise<FarmGameSave> {
  const farmRef = doc(db, "farms", playerId);
  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(farmRef);
    if (!snapshot.exists()) {
      const initial = createInitialFarmSave();
      transaction.set(farmRef, initial);
      return initial;
    }
    const data = snapshot.data();
    const farm = normalizeFarm(data);
    if (data.version !== 5) transaction.set(farmRef, farm);
    return farm;
  });
}

export async function performFarmAction(
  playerId: string,
  action: FarmAction,
): Promise<FarmGameSave> {
  const farmRef = doc(db, "farms", playerId);
  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(farmRef);
    const farm = snapshot.exists()
      ? normalizeFarm(snapshot.data())
      : createInitialFarmSave();
    const next = applyFarmActionToState(farm, action);
    transaction.set(farmRef, next);
    return next;
  });
}
