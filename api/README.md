# Quantum Recipe API 🌟🍳

A novel API that generates recipes using quantum-inspired algorithms. This API demonstrates how quantum concepts can be applied to creative domains like cooking.

## Core Concept

The API uses principles inspired by quantum mechanics:
- Superposition of ingredients based on their "quantum properties"
- Wavelength-based compatibility matching
- State coherence calculations
- Quantum-inspired probability distributions for success prediction

## Endpoints

### 1. Generate Quantum Recipe
```
POST /api/quantum-recipe

Request:
{
    "complexity": 3,  // Number of ingredients (1-5)
    "restrictions": [] // Dietary restrictions
}

Response:
{
    "recipe_id": "...",
    "ingredients": [...],
    "cooking_method": "...",
    "quantum_state": {
        "coherence": float,
        "stability": float,
        "timestamp": string
    },
    "estimated_success": float
}
```

### 2. Get Ingredient States
```
GET /api/ingredient-states

Returns all ingredients and their quantum properties
```

### 3. Get Cooking Methods
```
GET /api/cooking-methods

Returns available cooking methods and their energy states
```

## Innovation Points

1. **Quantum-Inspired Matching**: Uses wavelength properties to determine ingredient compatibility
2. **State Coherence**: Calculates recipe stability based on quantum-like properties
3. **Probabilistic Success**: Estimates recipe success using quantum-inspired calculations
4. **Time-Sensitive Generation**: Each recipe is unique based on quantum-like state at generation time

## Usage Example

```python
import requests

# Generate a new quantum recipe
response = requests.post('http://localhost:5000/api/quantum-recipe', 
                        json={'complexity': 3})
recipe = response.json()

print(f"Generated recipe with {len(recipe['ingredients'])} ingredients")
print(f"Estimated success rate: {recipe['estimated_success']*100}%")
```