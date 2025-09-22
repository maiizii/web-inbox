import React from "react";

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error("ErrorBoundary", error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="p-6 text-red-600">
          出错了: {this.state.error.message}
        </div>
      );
    }
    return this.props.children;
  }
}
