/** `justfile`'ın tarif grafiği; kapı bileşimlerinin tek kaynağı. */

/** `justfile` tarifleri: ad → ön koşul tarifleri. */
export function parseJustRecipes(text) {
  const recipes = new Map();
  for (const line of text.split('\n')) {
    const match = /^([a-z][\w-]*)([^:\n]*):(?!=)(.*)$/.exec(line);
    if (!match || match[1] === 'set') continue;
    const deps = match[3]
      .trim()
      .split(/\s+/)
      .filter((dep) => /^[a-z][\w-]*$/.test(dep));
    recipes.set(match[1], deps);
  }
  return recipes;
}

/** Birleşik kapıyı iç içe kapılar dahil tekil aşamalara açar; sıra korunur. */
export function gateStages(recipes, gate) {
  if (!recipes.has(gate)) throw new Error(`justfile içinde "${gate}" tarifi yok`);
  const stages = [];
  const visit = (name) => {
    const deps = recipes.get(name) ?? [];
    if (deps.length === 0) {
      if (!stages.includes(name)) stages.push(name);
      return;
    }
    for (const dep of deps) visit(dep);
  };
  visit(gate);
  return stages;
}
