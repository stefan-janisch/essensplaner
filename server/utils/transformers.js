export function rowToMeal(row) {
  return {
    id: row.id,
    name: row.name,
    ingredients: JSON.parse(row.ingredients),
    shoppingIngredients: row.shopping_ingredients ? JSON.parse(row.shopping_ingredients) : undefined,
    defaultServings: row.default_servings,
    starred: row.starred === 1,
    rating: row.rating,
    category: row.category,
    tags: row.tags ? JSON.parse(row.tags) : undefined,
    photoUrl: row.photo_url,
    recipeUrl: row.recipe_url,
    comment: row.comment,
    recipeText: row.recipe_text,
    prepTime: row.prep_time,
    totalTime: row.total_time,
  };
}
