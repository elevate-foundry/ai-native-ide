import requests
import json
from datetime import datetime

def test_quantum_recipe_api():
    """Test client for the Quantum Recipe API"""
    BASE_URL = "http://localhost:5000/api"
    
    # Test 1: Get ingredient states
    print("📊 Testing ingredient states...")
    response = requests.get(f"{BASE_URL}/ingredient-states")
    if response.status_code == 200:
        print("✅ Successfully retrieved ingredient states")
        print(f"Number of ingredients: {len(response.json())}")
    
    # Test 2: Generate recipes with different complexities
    print("\n🧪 Testing recipe generation...")
    complexities = [2, 3, 4]
    for complexity in complexities:
        print(f"\nGenerating recipe with complexity {complexity}:")
        response = requests.post(
            f"{BASE_URL}/quantum-recipe",
            json={"complexity": complexity}
        )
        
        if response.status_code == 200:
            recipe = response.json()
            print(f"🆔 Recipe ID: {recipe['recipe_id']}")
            print(f"📝 Ingredients: {', '.join(recipe['ingredients'])}")
            print(f"👨‍🍳 Cooking method: {recipe['cooking_method']}")
            print(f"🎯 Success probability: {recipe['estimated_success']*100:.1f}%")
            print(f"⚛️ Quantum coherence: {recipe['quantum_state']['coherence']:.2f}")
        else:
            print(f"❌ Error generating recipe: {response.status_code}")
    
    # Test 3: Get cooking methods
    print("\n🔍 Testing cooking methods...")
    response = requests.get(f"{BASE_URL}/cooking-methods")
    if response.status_code == 200:
        print("✅ Successfully retrieved cooking methods")
        print(f"Available methods: {', '.join(response.json().keys())}")

if __name__ == "__main__":
    print("🚀 Starting Quantum Recipe API tests...")
    try:
        test_quantum_recipe_api()
        print("\n✨ All tests completed!")
    except requests.exceptions.ConnectionError:
        print("❌ Error: Could not connect to API. Make sure the server is running.")