/** One baked model's entry in the generated index (scripts/assets/bake_models.py). Offsets count elements. */
export interface ModelEntry {
  vertex: number;
  vertices: number;
  index: number;
  indices: number;
  min: readonly number[];
  max: readonly number[];
  /** Height of the top surface over the middle of the footprint (a mattress, a table top), model units. */
  top: number;
  /** Which end along z stands taller (a bed's headboard): -1 at min z, +1 at max z, 0 neither. */
  tall: number;
}
