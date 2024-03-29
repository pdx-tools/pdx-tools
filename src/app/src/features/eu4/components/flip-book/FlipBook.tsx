import React, { useState } from "react";
import { Button } from "@/components/Button";
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline";

interface FlipBookProps<T> {
  items: T[];
  itemRender: (arg0: T) => JSX.Element;
}

export function FlipBook<T>({
  items,
  itemRender,
}: FlipBookProps<T>): JSX.Element {
  const [ind, setInd] = useState(0);
  if (items.length === 0) {
    return <span>None detected</span>;
  } else if (items.length === 1) {
    return itemRender(items[0]);
  } else {
    return (
      <div className="flex items-center space-x-2">
        <Button
          variant="ghost"
          disabled={ind == 0}
          onClick={() => setInd(ind - 1)}
        >
          <ChevronLeftIcon className="h-4 w-4" />
          <span className="sr-only">Previous</span>
        </Button>
        {itemRender(items[ind])}
        <Button
          variant="ghost"
          disabled={ind == items.length - 1}
          onClick={() => setInd(ind + 1)}
        >
          <ChevronRightIcon className="h-4 w-4" />
          <span className="sr-only">Next</span>
        </Button>
      </div>
    );
  }
}
