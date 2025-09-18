import React from "react";
export default function Loader({ text = "加载中..." }) {
  return <div className="p-6 text-center text-gray-500">{text}</div>;
}
