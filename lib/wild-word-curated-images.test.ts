/**
 * Run: `npx tsx lib/wild-word-curated-images.test.ts`
 */
import assert from "node:assert/strict";

import { lookupCuratedWordImage } from "./wild-word-curated-images";

function lookup(text: string, language = "es") {
  return lookupCuratedWordImage({ language, text });
}

const mesas = lookup("Mesas");
assert.ok(mesas);
assert.equal(mesas.imageUrl, "/images/chunks/mesa.png");
assert.equal(mesas.imageSource, "curated");

const cafe = lookup("café");
assert.ok(cafe);
assert.equal(cafe.imageUrl, "/images/chunks/cafe.png");

const habitacion = lookup("habitacion");
assert.ok(habitacion);
assert.equal(habitacion.imageUrl, "/images/chunks/habitacion.png");

assert.equal(lookup("Disculpe"), null);
assert.equal(lookup("learning", "en"), null);

const cuenta = lookup("cuenta");
assert.ok(cuenta);
assert.equal(cuenta.imageUrl, "/images/chunks/cuenta.png");

const laCuenta = lookup("la cuenta");
assert.ok(laCuenta);
assert.equal(laCuenta.imageUrl, "/images/chunks/cuenta.png");

const estacion = lookup("estación de tren");
assert.ok(estacion);
assert.equal(estacion.imageUrl, "/images/chunks/estacion-tren.png");

const llaves = lookup("llaves");
assert.ok(llaves);
assert.equal(llaves.imageUrl, "/images/chunks/llave.png");

const picante = lookup("picante");
assert.ok(picante);
assert.equal(picante.imageUrl, "/images/chunks/picante.png");

const pasaporte = lookup("pasaporte");
assert.ok(pasaporte);
assert.equal(pasaporte.imageUrl, "/images/chunks/pasaporte.png");

const miPasaporte = lookup("mi pasaporte");
assert.ok(miPasaporte);
assert.equal(miPasaporte.imageUrl, "/images/chunks/pasaporte.png");

console.log("wild-word-curated-images.test.ts: ok");
