import { redirect } from "next/navigation";

// 暂存区 was folded into 我的库 as the "闲置" filter (see ui-terminology v0.4).
export default function ParkingRedirect() {
  redirect("/library");
}
