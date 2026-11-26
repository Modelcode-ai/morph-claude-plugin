import http from "k6/http";
import { check } from "k6";

export default function () {
  check(http.get("http://localhost:3000/health"), { "is up": (r) => r.status === 200 });
}
