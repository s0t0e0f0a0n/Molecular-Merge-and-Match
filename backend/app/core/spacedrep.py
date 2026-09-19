import math

def calculate_spaced_repetition_interval(
    time_min: float,
    incorrect_tries: int,
    cheat_used: bool,
    confidence: int,
    difficulty: int,
    is_first_attempt: bool
) -> dict:
    """
    Calculates the Mastery Index and the next Spaced Repetition interval in days.

    Inputs:
    - time_min: Solve time in minutes (Can exceed 40)
    - incorrect_tries: Number of wrong validation attempts
    - cheat_used: True/False flag
    - confidence: Integer from 1 to 5
    - difficulty: Integer from 1 to 3
    - is_first_attempt: True if first try, False if solved before
    """

    # -------------------------------------------------------------------------
    # STEP 2: Individual Component Normalization (Range 0.0 to 1.0, unless noted)
    # -------------------------------------------------------------------------

    # 1. Penalty Component (C_P)
    if cheat_used:
        C_P = 0.0
    else:
        C_P = math.exp(-0.4 * incorrect_tries)

    # 2. Time Component (C_T) - Allowed to go negative for long solve times
    C_T = 1.0 - (time_min - 1.0) / 39.0

    # 3. Perceived Difficulty Component (C_D)
    C_D = (3.0 - difficulty) / 2.0

    # 4. Confidence Component (C_C)
    C_C = (confidence - 1.0) / 4.0

    # -------------------------------------------------------------------------
    # STEP 3: Combined Mastery Index Score (M)
    # -------------------------------------------------------------------------

    # Weighted base score calculation
    M = (0.35 * C_P) + (0.25 * C_T) + (0.20 * C_D) + (0.20 * C_C)

    # Constraint: The base M value is never allowed to be smaller than 0
    if M < 0:
        M = 0.0

    # History Multiplier conditional application:
    # ONLY applied if it is a subsequent attempt AND no cheats AND zero incorrect tries.
    if not is_first_attempt and not cheat_used and incorrect_tries == 0:
        H = 1.3
    else:
        H = 1.0

    # Compute M_final (Explicitly left uncapped per your instructions)
    M_final = M * H

    # -------------------------------------------------------------------------
    # STEP 4: Exponential Interval Mapping
    # -------------------------------------------------------------------------
    # Target Map: M=0 -> 2 days, M=1 -> 40 days.
    # Formula: Days = 2 + (40 - 2) * (M_final ^ 2)
    days = 2.0 + 38.0 * (M_final ** 2)

    return {
        "mastery_index": M_final,
        "next_review_days": round(days, 2),
        "debug_components": {"C_P": C_P, "C_T": C_T, "C_D": C_D, "C_C": C_C}
    }

# --- Quick Verification Examples ---

# 1. Perfect subsequent review (M_final goes above 1.0 -> Interval climbs past 40 days)
perfect_review = calculate_spaced_repetition_interval(
    time_min=1.0, incorrect_tries=0, cheat_used=False, confidence=5, difficulty=1, is_first_attempt=False
)
print(f"Perfect Subsequent Attempt: {perfect_review['next_review_days']} days (Mastery: {perfect_review['mastery_index']})")
# Output: 66.22 days

# 2. Extreme slow attempt (Negative C_T component, but M floor drops safely to 0)
terrible_review = calculate_spaced_repetition_interval(
    time_min=200.0, incorrect_tries=10, cheat_used=True, confidence=1, difficulty=3, is_first_attempt=True
)
print(f"Failed Attempt: {terrible_review['next_review_days']} days (Mastery: {terrible_review['mastery_index']})")
# Output: 2.0 days


# statistics.confidence
# statistics.difficulty
# statistics.timer_total
# statistics.cheats_used
# statistics.incorrect_count
