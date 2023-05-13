import { RefObject, useState, MouseEvent, MutableRefObject } from "react";

export const useScroll = () => {
  const [carouselRef, setCarouselRef] = useState<RefObject<HTMLElement>>();
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  const handleMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if (!carouselRef?.current) return;
    setIsDragging(true);
    setStartX(e.pageX - carouselRef.current!.offsetLeft);
    setScrollLeft(carouselRef.current!.scrollLeft);
  };

  const handleMouseLeave = () => {
    setIsDragging(false);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!carouselRef?.current) return;
    if (!isDragging) return;
    e.preventDefault();
    const x = e.pageX - carouselRef.current!.offsetLeft;
    const walk = (x - startX) * 1; // Adjust the drag speed here
    carouselRef.current!.scrollLeft = scrollLeft - walk;
  };

  return {
    setRef: setCarouselRef,
    handleMouseLeave,
    handleMouseUp,
    handleMouseMove,
    handleMouseDown,
  };
};
