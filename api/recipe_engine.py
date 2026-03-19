from dataclasses import dataclass
from typing import List, Dict, Optional, Tuple
import numpy as np
from enum import Enum

class NutrientType(Enum):
    PROTEIN = "protein"
    FIBER = "fiber"
    VITAMINS = "vitamins"
    FATS = "fats"
    CARBS = "carbs"

@dataclass
class Ingredient:
    name: str
    nutrients: Dict[NutrientType, float]
    taste_profile: np.ndarray  # 5-dimensional: sweet, salty, sour, bitter, umami
    cooking_methods: List[str]
    max_temp: float  # maximum safe temperature in Celsius
    min_temp: float  # minimum temp for food safety
    prep_time: int   # minutes
    
    def compatibility_score(self, other: 'Ingredient') -> float:
        """Calculate real compatibility based on taste chemistry"""
        taste_synergy = 1 - np.linalg.norm(self.taste_profile - other.taste_profile)
        temp_overlap = max(0, min(self.max_temp, other.max_temp) - 
                         max(self.min_temp, other.min_temp)) / 100
        method_overlap = len(set(self.cooking_methods) & 
                           set(other.cooking_methods)) / len(self.cooking_methods)
        return (taste_synergy * 0.5 + temp_overlap * 0.3 + method_overlap * 0.2)

class RecipeOptimizer:
    def __init__(self, ingredients: List[Ingredient], constraints: Dict):
        self.ingredients = ingredients
        self.constraints = constraints
        self.compatibility_matrix = self._build_compatibility_matrix()
    
    def _build_compatibility_matrix(self) -> np.ndarray:
        """Build pairwise ingredient compatibility matrix"""
        n = len(self.ingredients)
        matrix = np.zeros((n, n))
        for i in range(n):
            for j in range(i+1, n):
                score = self.ingredients[i].compatibility_score(self.ingredients[j])
                matrix[i,j] = matrix[j,i] = score
        return matrix
    
    def optimize_recipe(self) -> Tuple[List[Ingredient], float]:
        """Find optimal ingredient combination satisfying constraints"""
        best_score = float('-inf')
        best_combo = None
        
        # Use real constraints
        max_prep_time = self.constraints.get('max_prep_time', float('inf'))
        required_nutrients = self.constraints.get('nutrients', {})
        
        # Simple genetic algorithm for optimization
        population = self._initialize_population()
        for generation in range(100):
            scored_recipes = []
            for recipe in population:
                score = self._evaluate_recipe(recipe, max_prep_time, required_nutrients)
                if score > best_score:
                    best_score = score
                    best_combo = recipe
                scored_recipes.append((recipe, score))
            
            population = self._evolve_population(scored_recipes)
            
        return ([self.ingredients[i] for i in best_combo], best_score)
    
    def _evaluate_recipe(self, recipe_indices, max_prep_time, required_nutrients):
        """Score recipe based on real constraints and chemistry"""
        ingredients = [self.ingredients[i] for i in recipe_indices]
        
        # Check prep time constraint
        total_prep = sum(ing.prep_time for ing in ingredients)
        if total_prep > max_prep_time:
            return float('-inf')
            
        # Calculate nutrient coverage
        total_nutrients = {nt: 0.0 for nt in NutrientType}
        for ing in ingredients:
            for nt, amount in ing.nutrients.items():
                total_nutrients[nt] += amount
                
        # Check nutrient constraints
        for nt, required in required_nutrients.items():
            if total_nutrients[nt] < required:
                return float('-inf')
        
        # Calculate compatibility score
        compat_score = 0
        for i in range(len(recipe_indices)):
            for j in range(i+1, len(recipe_indices)):
                compat_score += self.compatibility_matrix[recipe_indices[i], 
                                                        recipe_indices[j]]
        
        return compat_score / (len(recipe_indices) * (len(recipe_indices)-1) / 2)

    # Additional optimization methods omitted for brevity