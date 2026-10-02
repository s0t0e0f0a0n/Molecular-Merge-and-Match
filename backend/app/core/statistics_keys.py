def statistics_exercise_id_keys(exercise_id: int | str) -> tuple[str, ...]:
    key = str(exercise_id)
    if key.startswith("exercise-"):
        suffix = key.removeprefix("exercise-")
        return (suffix, key) if suffix.isdigit() else (key,)
    if key.isdigit():
        return (key, f"exercise-{key}")
    return (key,)


def canonical_statistics_exercise_id(exercise_id: int | str) -> str:
    return statistics_exercise_id_keys(exercise_id)[0]
