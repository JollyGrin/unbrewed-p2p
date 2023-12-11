import { useState, useEffect } from "react";

const useDelayedTrue = (duration = 500) => {
  const [value, setValue] = useState(false);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setValue(true);
    }, duration);

    // Cleanup the timeout to avoid potential memory leaks
    return () => clearTimeout(timeoutId);
  }, [duration]); // Empty dependency array ensures that the effect runs only once

  return value;
};

export default useDelayedTrue;
