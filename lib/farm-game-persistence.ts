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
    const simulationChanged = data.version !== 9
      || JSON.stringify(farm.workers) !== JSON.stringify(data.workers)
      || JSON.stringify(farm.obstacles) !== JSON.stringify(data.obstacles)
      || JSON.stringify(farm.fruitInventory) !== JSON.stringify(data.fruitInventory)
      || farm.gems !== data.gems
      || JSON.stringify(farm.quests) !== JSON.stringify(data.quests);
    if (simulationChanged) transaction.set(farmRef, farm);
    return farm;
  });
}

export async function syncFarmSimulation(
  playerId: string,
  now = Date.now(),
): Promise<FarmGameSave> {
  const farmRef = doc(db, "farms", playerId);
  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(farmRef);
    const farm = snapshot.exists()
      ? normalizeFarm(snapshot.data(), now)
      : createInitialFarmSave(now);
    transaction.set(farmRef, farm);
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
