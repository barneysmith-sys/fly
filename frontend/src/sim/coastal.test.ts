import assert from "node:assert/strict";
import test from "node:test";
import { resolveContacts } from "./collision.ts";
import { coastalSite, MAINTENANCE, MAIN_HANGAR } from "./coastal.ts";
import { vehicleState } from "./vehicle.ts";

test("coastal launch is clear and the precision pad is marked", () => {
  const site = coastalSite();
  const launch = site.launch;
  const hit = resolveContacts(
    vehicleState({ positionM: { x: launch.x, y: launch.y, z: 2 } }),
    site.boxes,
    0.18,
  );
  assert.equal(hit.contact, null);
  const pad = site.boxes.find((box) => box.id === "precision-pad");
  assert.ok(pad?.pad);
  assert.equal(site.pad.id, "precision-pad");
});

test("the maintenance doorway is open and the back wall is solid", () => {
  const site = coastalSite();
  const door = resolveContacts(
    vehicleState({ positionM: { x: (MAINTENANCE.x0 + MAINTENANCE.x1) / 2, y: MAINTENANCE.y0 + 3, z: 2 } }),
    site.boxes,
    0.18,
  );
  assert.equal(door.contact, null);
  const wall = resolveContacts(
    vehicleState({ positionM: { x: (MAINTENANCE.x0 + MAINTENANCE.x1) / 2, y: MAINTENANCE.y1, z: 2 } }),
    site.boxes,
    0.18,
  );
  assert.equal(wall.contact?.id, "maintenance-north");
});

test("the main hangar blocks its interior", () => {
  const site = coastalSite();
  const inside = resolveContacts(
    vehicleState({
      positionM: {
        x: (MAIN_HANGAR.minX + MAIN_HANGAR.maxX) / 2,
        y: (MAIN_HANGAR.minY + MAIN_HANGAR.maxY) / 2,
        z: 4,
      },
    }),
    site.boxes,
    0.18,
  );
  assert.equal(inside.contact?.id, "main-hangar");
});
