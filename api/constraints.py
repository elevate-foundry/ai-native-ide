from typing import Dict, Any
from dataclasses import dataclass
from enum import Enum

class ConstraintType(Enum):
    HARD = "hard"  # Must be satisfied
    SOFT = "soft"  # Preferences, weighted importance

@dataclass
class Constraint:
    type: ConstraintType
    value: Any
    weight: float = 1.0  # For soft constraints
    
    def check(self, state: Dict[str, Any]) -> float:
        """
        Returns:
            1.0 if constraint fully satisfied
            0.0 if completely violated
            Float between 0-1 for partial satisfaction
        """
        raise NotImplementedError

class TimeConstraint(Constraint):
    def check(self, state: Dict[str, Any]) -> float:
        if self.type == ConstraintType.HARD:
            return float(state['time'] <= self.value)
        return max(0, 1 - (state['time'] - self.value) / self.value)

class NutrientConstraint(Constraint):
    def check(self, state: Dict[str, Any]) -> float:
        current = state['nutrients'].get(self.value['nutrient'], 0)
        target = self.value['amount']
        
        if self.type == ConstraintType.HARD:
            return float(current >= target)
        return min(1.0, current / target)

class CompatibilityConstraint(Constraint):
    def check(self, state: Dict[str, Any]) -> float:
        """Check ingredient compatibility scores"""
        scores = state['compatibility_scores']
        if self.type == ConstraintType.HARD:
            return float(min(scores) >= self.value)
        return sum(max(0, score - self.value) for score in scores) / len(scores)

class ConstraintSolver:
    def __init__(self, constraints: Dict[str, Constraint]):
        self.constraints = constraints
        
    def evaluate(self, state: Dict[str, Any]) -> Tuple[bool, float]:
        """
        Returns:
            (feasible, score)
            feasible: Whether all hard constraints are satisfied
            score: Overall satisfaction score for soft constraints
        """
        feasible = True
        soft_scores = []
        
        for name, constraint in self.constraints.items():
            satisfaction = constraint.check(state)
            
            if constraint.type == ConstraintType.HARD:
                if satisfaction < 1.0:
                    feasible = False
                    break
            else:
                soft_scores.append(satisfaction * constraint.weight)
        
        if not feasible:
            return False, 0.0
            
        return True, sum(soft_scores) / sum(c.weight for c in 
                        self.constraints.values() 
                        if c.type == ConstraintType.SOFT)