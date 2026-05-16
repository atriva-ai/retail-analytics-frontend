import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Construction } from "lucide-react"

export default function ProductAnalyticsPage() {
  return (
    <div className="flex-1 p-4 md:p-8 pt-6">
      <h2 className="text-3xl font-bold tracking-tight mb-6">Product Analytics</h2>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Construction className="h-5 w-5 text-muted-foreground" />
            Coming Soon
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Product analytics are under development and will be available in a future release.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
