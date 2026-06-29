import React from "react";
import { Navigate } from "react-router-dom";

export default function Settings() {
  return <Navigate to="/dashboard/master-password" replace />;
}