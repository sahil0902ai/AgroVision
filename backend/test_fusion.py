from app.services.recommendations import ExpertRecommendationEngine


def test_feature_fusion_engine():
    print("==========================================")
    print("Testing Task 3: Multimodal Feature Fusion & Expert Advice")
    print("==========================================")
    
    # Scenario 1: High Leaf Water Stress + Heavy Rain + Saturated Soil
    cnn_probs_1 = {
        "healthy": 10.0,
        "water_stress": 65.0,
        "heat_stress": 15.0,
        "nutrient_deficiency": 5.0,
        "pollution": 5.0
    }
    snn_severity_1 = "Moderate"
    env_data_1 = {
        "temperature": 32.0,
        "humidity": 65.0,
        "soil_moisture": 60.0, # Saturated soil (> 55%)
        "rainfall_mm": 35.0,   # Heavy rain expected (> 20mm)
        "aqi": 75.0
    }
    
    recs_1 = ExpertRecommendationEngine.evaluate(cnn_probs_1, snn_severity_1, env_data_1)
    print("\nScenario 1 (Water Stress + Heavy Rain Forecast):")
    for r in recs_1:
        print(f"  * {r}")
        
    assert any("Over-Irrigation" in r for r in recs_1), "Rule Engine failed to trigger Over-Irrigation risk!"
    print("[OK] Scenario 1 Rule Trigger Verified.")

    # Scenario 2: High Thermal Stress + Extreme Temperature + Depleted Soil
    cnn_probs_2 = {
        "healthy": 15.0,
        "water_stress": 10.0,
        "heat_stress": 60.0,
        "nutrient_deficiency": 10.0,
        "pollution": 5.0
    }
    snn_severity_2 = "High"
    env_data_2 = {
        "temperature": 41.5, # Extreme heat (> 38C)
        "humidity": 40.0,
        "soil_moisture": 20.0, # Depleted soil (< 25%)
        "rainfall_mm": 0.0,
        "aqi": 110.0
    }
    
    recs_2 = ExpertRecommendationEngine.evaluate(cnn_probs_2, snn_severity_2, env_data_2)
    print("\nScenario 2 (Thermal Stress + High SNN Risk):")
    for r in recs_2:
        print(f"  * {r}")
        
    assert any("Thermal & Desiccation Stress" in r for r in recs_2), "Rule Engine failed thermal stress advice!"
    print("[OK] Scenario 2 Rule Trigger Verified.")

    print("\n>>> Task 3 Validation PASSED Successfully! <<<\n")

if __name__ == "__main__":
    test_feature_fusion_engine()
